/**
 * Job Pusher — Gemini Scorer for Google Sheets
 * =============================================
 * Paste this entire script into your Google Sheet:
 *   Extensions → Apps Script → paste → Save → Run scoreUnscoredJobs
 *
 * SETUP:
 *   1. Open your Google Sheet (the one with the Raw Jobs tab)
 *   2. Click Extensions → Apps Script
 *   3. Delete the default code and paste this entire file
 *   4. Click Save (floppy disk icon)
 *   5. Set your Gemini API key in the CONFIG section below
 *   6. Click Run → scoreUnscoredJobs
 *   7. Grant permissions when prompted (first run only)
 *
 * WHAT IT DOES:
 *   - Reads jobs from the "Raw Jobs" tab
 *   - Scores each unscored job using Gemini AI
 *   - Writes scores into the same row (match_score, match_summary, etc.)
 *   - Creates a "Matched Jobs" tab with jobs above your min score
 *   - Skips rows that already have a match_score (safe to re-run)
 *
 * COLUMNS USED:
 *   Input:  title, company, location, job_type, description
 *   Output: match_score, match_summary, matched_skills, missing_skills, recommendation
 */

// ============================================================
// CONFIG — set your values here
// ============================================================
var CONFIG = {
  GEMINI_API_KEY: "YOUR_GEMINI_API_KEY_HERE",   // ← paste your key
  GEMINI_MODEL:   "gemini-2.0-flash",
  MIN_SCORE:      60,                             // minimum score to copy to Matched Jobs tab
  RAW_SHEET:      "Raw Jobs",
  MATCHED_SHEET:  "Matched Jobs",
  DELAY_MS:       4500,                           // ~13 RPM — stays under free tier 15 RPM limit
};

// ============================================================
// CV — paste your profile here (keep it under 4000 characters)
// ============================================================
var CV_TEXT = `
Experienced Delivery Lead and Project Manager with 6.5+ years leading large,
cross-functional global teams across sustainable finance, telecommunications,
AI integration, and healthcare technology.

CORE SKILLS:
- Project & Programme Management (end-to-end, 30-40 member teams, 100% KPI compliance)
- Sustainable Finance & ESG (PCAF, TNFD, CSRD, Climate Transition Tool, 2000+ clients)
- AI Integration & Automation (Excel macros, workflow automation, AI-assisted development)
- Data Analytics (Advanced Excel, Power Query, dashboards, pivot analysis)
- Stakeholder Management (junior to CXO, multinational environments)
- Change Management, SOP creation, Risk Management, Agile delivery

RECENT EXPERIENCE:
- Delivery Lead, Acuity Knowledge Partners (Apr 2025–Present): Led Climate Transition Tool for 2000+ institutional clients
- Senior Associate, Acuity Knowledge Partners (Jun 2023–Apr 2025): ESG evidence library, CAPA protocol, automation
- Key Account Executive, Huawei Technologies (Nov 2019–May 2023): $1.3M sales, DAC gap $5.3M → $0.3M

EDUCATION: MBA Marketing (Cardiff Met, Merit), BMgt Business & Accounting (SWUFE China, 3.2 GPA)
LOCATION: Albury NSW — open to Albury/Wodonga region, Vline corridor, Melbourne, remote
RIGHT TO WORK: Subclass 485 visa, unrestricted, valid until 2029
`;

// ============================================================
// MAIN — run this from the menu or Apps Script UI
// ============================================================
function scoreUnscoredJobs() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var rawSheet = ss.getSheetByName(CONFIG.RAW_SHEET);

  if (!rawSheet) {
    SpreadsheetApp.getUi().alert('Sheet "' + CONFIG.RAW_SHEET + '" not found.\nMake sure your CSV was imported into a tab named "' + CONFIG.RAW_SHEET + '".');
    return;
  }

  if (!CONFIG.GEMINI_API_KEY || CONFIG.GEMINI_API_KEY === "YOUR_GEMINI_API_KEY_HERE") {
    SpreadsheetApp.getUi().alert("Please set your GEMINI_API_KEY in the CONFIG section at the top of the script.");
    return;
  }

  var data = rawSheet.getDataRange().getValues();
  if (data.length < 2) {
    SpreadsheetApp.getUi().alert("No data rows found in " + CONFIG.RAW_SHEET);
    return;
  }

  var headers = data[0].map(function(h) { return String(h).toLowerCase().trim(); });

  // Required input columns
  var colTitle       = headers.indexOf("title");
  var colCompany     = headers.indexOf("company");
  var colLocation    = headers.indexOf("location");
  var colJobType     = headers.indexOf("job_type");
  var colDescription = headers.indexOf("description");

  if (colTitle === -1 || colDescription === -1) {
    SpreadsheetApp.getUi().alert('Could not find "title" or "description" columns.\nCheck your column headers.');
    return;
  }

  // Output columns — add if missing
  var colScore       = _ensureColumn(rawSheet, headers, "match_score");
  var colSummary     = _ensureColumn(rawSheet, headers, "match_summary");
  var colMatched     = _ensureColumn(rawSheet, headers, "matched_skills");
  var colMissing     = _ensureColumn(rawSheet, headers, "missing_skills");
  var colRec         = _ensureColumn(rawSheet, headers, "recommendation");

  // Re-read headers after possible new columns
  headers = rawSheet.getRange(1, 1, 1, rawSheet.getLastColumn()).getValues()[0].map(function(h) {
    return String(h).toLowerCase().trim();
  });
  colScore   = headers.indexOf("match_score");
  colSummary = headers.indexOf("match_summary");
  colMatched = headers.indexOf("matched_skills");
  colMissing = headers.indexOf("missing_skills");
  colRec     = headers.indexOf("recommendation");

  // Re-read all data with new columns
  data = rawSheet.getDataRange().getValues();

  var scored = 0;
  var skipped = 0;
  var failed = 0;

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var existingScore = row[colScore];

    // Skip if already scored
    if (existingScore !== "" && existingScore !== null && existingScore !== undefined) {
      skipped++;
      continue;
    }

    var title       = colTitle >= 0       ? String(row[colTitle] || "")       : "";
    var company     = colCompany >= 0     ? String(row[colCompany] || "")     : "";
    var location    = colLocation >= 0    ? String(row[colLocation] || "")    : "";
    var jobType     = colJobType >= 0     ? String(row[colJobType] || "")     : "";
    var description = colDescription >= 0 ? String(row[colDescription] || "") : "";

    if (!title && !description) {
      skipped++;
      continue;
    }

    Logger.log("Scoring row " + (i + 1) + ": " + title + " @ " + company);

    var result = _callGemini(title, company, location, jobType, description);

    if (result) {
      rawSheet.getRange(i + 1, colScore + 1).setValue(result.score);
      rawSheet.getRange(i + 1, colSummary + 1).setValue(result.summary || "");
      rawSheet.getRange(i + 1, colMatched + 1).setValue((result.matched_skills || []).join(", "));
      rawSheet.getRange(i + 1, colMissing + 1).setValue((result.missing_skills || []).join(", "));
      rawSheet.getRange(i + 1, colRec + 1).setValue(result.recommendation || "");
      scored++;
    } else {
      rawSheet.getRange(i + 1, colScore + 1).setValue("FAILED");
      failed++;
    }

    // Flush and rate limit
    SpreadsheetApp.flush();
    if (i < data.length - 1) Utilities.sleep(CONFIG.DELAY_MS);
  }

  // Copy matched jobs to Matched Jobs tab
  _buildMatchedSheet(ss, rawSheet);

  var msg = "Done!\n\nScored: " + scored + "\nSkipped (already scored): " + skipped + "\nFailed: " + failed;
  SpreadsheetApp.getUi().alert(msg);
}


// Retry failed rows only
function retryFailedJobs() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var rawSheet = ss.getSheetByName(CONFIG.RAW_SHEET);
  if (!rawSheet) return;

  var data = rawSheet.getDataRange().getValues();
  var headers = data[0].map(function(h) { return String(h).toLowerCase().trim(); });
  var colScore = headers.indexOf("match_score");
  if (colScore === -1) { SpreadsheetApp.getUi().alert("No match_score column found."); return; }

  // Clear FAILED rows so scoreUnscoredJobs will pick them up
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][colScore]).toUpperCase() === "FAILED") {
      rawSheet.getRange(i + 1, colScore + 1).setValue("");
    }
  }

  SpreadsheetApp.getUi().alert("Cleared FAILED rows. Running scorer now...");
  scoreUnscoredJobs();
}


// ============================================================
// HELPERS
// ============================================================
function _callGemini(title, company, location, jobType, description) {
  var prompt = _buildPrompt(title, company, location, jobType, description);
  var url = "https://generativelanguage.googleapis.com/v1beta/models/" +
            CONFIG.GEMINI_MODEL + ":generateContent?key=" + CONFIG.GEMINI_API_KEY;

  var payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.1 }
  };

  var options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  for (var attempt = 0; attempt < 3; attempt++) {
    try {
      var response = UrlFetchApp.fetch(url, options);
      var code = response.getResponseCode();

      if (code === 429) {
        Logger.log("Rate limit hit — waiting 30s");
        Utilities.sleep(30000);
        continue;
      }

      if (code !== 200) {
        Logger.log("HTTP " + code + ": " + response.getContentText().substring(0, 200));
        return null;
      }

      var body = JSON.parse(response.getContentText());
      var text = body.candidates[0].content.parts[0].text.trim();

      // Strip markdown code fences if present
      text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

      return JSON.parse(text);

    } catch (e) {
      Logger.log("Attempt " + (attempt + 1) + " error: " + e);
      if (attempt < 2) Utilities.sleep(5000);
    }
  }

  return null;
}


function _buildPrompt(title, company, location, jobType, description) {
  var desc = description.length > 3000 ? description.substring(0, 3000) : description;
  var cv   = CV_TEXT.length > 4000     ? CV_TEXT.substring(0, 4000)     : CV_TEXT;

  return 'You are an expert job matching assistant. Analyse how well this candidate matches the job.\n\n' +
         '=== CANDIDATE PROFILE ===\n' + cv + '\n\n' +
         '=== JOB POSTING ===\n' +
         'Title: ' + title + '\n' +
         'Company: ' + company + '\n' +
         'Location: ' + location + '\n' +
         'Job Type: ' + jobType + '\n\n' +
         'Description:\n' + desc + '\n\n' +
         '=== INSTRUCTIONS ===\n' +
         'Score how well the candidate matches this job on a scale of 0-100.\n' +
         'Respond with ONLY a valid JSON object (no markdown, no explanation outside JSON):\n' +
         '{\n' +
         '  "score": <integer 0-100>,\n' +
         '  "matched_skills": ["skill1", "skill2"],\n' +
         '  "missing_skills": ["skill1", "skill2"],\n' +
         '  "summary": "<2-3 sentence explanation>",\n' +
         '  "recommendation": "<apply|consider|skip>"\n' +
         '}';
}


function _ensureColumn(sheet, headers, colName) {
  var idx = headers.indexOf(colName.toLowerCase());
  if (idx === -1) {
    var newCol = sheet.getLastColumn() + 1;
    sheet.getRange(1, newCol).setValue(colName);
    return newCol - 1; // 0-based
  }
  return idx;
}


function _buildMatchedSheet(ss, rawSheet) {
  var data = rawSheet.getDataRange().getValues();
  var headers = data[0].map(function(h) { return String(h).toLowerCase().trim(); });
  var colScore = headers.indexOf("match_score");
  if (colScore === -1) return;

  var matched = [data[0]]; // header row
  for (var i = 1; i < data.length; i++) {
    var score = parseFloat(data[i][colScore]);
    if (!isNaN(score) && score >= CONFIG.MIN_SCORE) {
      matched.push(data[i]);
    }
  }

  // Get or create Matched Jobs tab
  var matchedSheet = ss.getSheetByName(CONFIG.MATCHED_SHEET);
  if (!matchedSheet) {
    matchedSheet = ss.insertSheet(CONFIG.MATCHED_SHEET);
  } else {
    matchedSheet.clearContents();
  }

  if (matched.length > 1) {
    matchedSheet.getRange(1, 1, matched.length, matched[0].length).setValues(matched);
    // Sort by score descending (find match_score column in output)
    var scoreCol = matched[0].map(function(h) { return String(h).toLowerCase(); }).indexOf("match_score") + 1;
    if (scoreCol > 0 && matched.length > 2) {
      matchedSheet.getRange(2, 1, matched.length - 1, matched[0].length)
        .sort({ column: scoreCol, ascending: false });
    }
  }

  Logger.log("Matched Jobs tab updated with " + (matched.length - 1) + " jobs above " + CONFIG.MIN_SCORE + "%");
}


// ============================================================
// MENU — adds "Job Pusher" menu to the sheet
// ============================================================
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Job Pusher")
    .addItem("Score unscored jobs", "scoreUnscoredJobs")
    .addItem("Retry failed jobs", "retryFailedJobs")
    .addToUi();
}
