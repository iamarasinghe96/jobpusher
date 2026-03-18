/**
 * JobPusher – Google Apps Script
 * ================================
 * Reads jobs from "Raw Jobs" sheet, pre-filters by CV keywords,
 * then calls Gemini to score each job against your CV.
 *
 * Setup:
 *   1. Open your Google Sheet → Extensions → Apps Script → paste this file
 *   2. Add your Gemini API key in Project Settings → Script Properties:
 *        Key: GEMINI_API_KEY   Value: <your key>
 *   3. Paste your full CV text in the "CV" sheet, cell A1
 *   4. Adjust Config sheet: match_threshold, exclude_keywords
 *   5. Run "Score New Jobs" from the JobPusher menu (or set a time trigger)
 */

// ─── Column indices in "Raw Jobs" (0-based) ─────────────────────────────────
var COL = {
  scraped_at:     0,
  source:         1,
  title:          2,
  company:        3,
  location:       4,
  job_type:       5,
  salary_min:     6,
  salary_max:     7,
  url:            8,
  description:    9,
  keyword_match:  10,
  gemini_score:   11,
  gemini_reason:  12,
  shortlisted:    13,
};

var GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";

// ─── Menu ────────────────────────────────────────────────────────────────────
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("JobPusher")
    .addItem("Score New Jobs", "scoreNewJobs")
    .addItem("Re-score All Jobs", "scoreAllJobs")
    .addItem("Extract CV Keywords (preview)", "previewCvKeywords")
    .addItem("Clear Scores", "clearScores")
    .addToUi();
}

// ─── Config helpers ──────────────────────────────────────────────────────────
function getConfig() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var cfg = {};

  try {
    var configSheet = ss.getSheetByName("Config");
    if (configSheet) {
      var data = configSheet.getDataRange().getValues();
      data.forEach(function(row) {
        if (row[0]) cfg[row[0]] = row[1];
      });
    }
  } catch (e) {}

  return {
    threshold:       parseInt(cfg["match_threshold"] || "60", 10),
    excludeKeywords: (cfg["exclude_keywords"] || "").split(",").map(function(s){ return s.trim().toLowerCase(); }).filter(Boolean),
    shortlistTab:    cfg["shortlist_tab"] || "Shortlisted",
  };
}

function getCvText() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var cvSheet = ss.getSheetByName("CV");
  if (!cvSheet) throw new Error("No 'CV' sheet found. Create one and paste your CV in cell A1.");
  var text = cvSheet.getRange("A1").getValue();
  if (!text || text.toString().trim().length < 50) {
    throw new Error("CV sheet A1 is empty or too short. Paste your full CV text there.");
  }
  return text.toString().trim();
}

function getGeminiKey() {
  var key = PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY not set in Script Properties.");
  return key;
}

// ─── Keyword extraction from CV ──────────────────────────────────────────────
/**
 * Extract meaningful keywords from CV text.
 * Returns an array of lowercase keyword strings.
 */
function extractCvKeywords(cvText) {
  // Common stopwords to ignore
  var stopwords = new Set([
    "a","an","the","and","or","but","in","on","at","to","for","of","with",
    "is","was","are","were","be","been","being","have","has","had","do",
    "does","did","will","would","could","should","may","might","shall",
    "i","my","me","we","our","you","your","he","she","it","they","their",
    "this","that","these","those","from","by","as","up","out","about",
    "into","through","during","before","after","above","below","between",
    "each","more","most","other","some","such","no","not","only","same",
    "so","than","too","very","just","both","first","second","also",
    "experience","years","year","work","working","worked","responsible",
    "role","team","company","position","job","based","strong","good",
    "ability","skills","skill","knowledge","understanding","including",
    "within","across","using","ensure","support","provide","develop",
    "manage","lead","help","make","use","new","high","large","small",
  ]);

  var words = cvText
    .replace(/[^a-zA-Z0-9#+.\-\s]/g, " ")
    .toLowerCase()
    .split(/\s+/);

  // Count word frequency
  var freq = {};
  words.forEach(function(w) {
    w = w.replace(/^[-.]|[-.]$/g, ""); // strip leading/trailing hyphens/dots
    if (w.length >= 3 && !stopwords.has(w) && !/^\d+$/.test(w)) {
      freq[w] = (freq[w] || 0) + 1;
    }
  });

  // Also extract bigrams for tech terms (e.g. "machine learning", "power bi")
  var bigrams = [];
  for (var i = 0; i < words.length - 1; i++) {
    var bigram = words[i] + " " + words[i + 1];
    if (!stopwords.has(words[i]) && !stopwords.has(words[i + 1]) &&
        words[i].length >= 3 && words[i + 1].length >= 3) {
      bigrams.push(bigram);
    }
  }

  // Sort by frequency, take top single keywords
  var sorted = Object.entries(freq)
    .sort(function(a, b) { return b[1] - a[1]; })
    .slice(0, 60)
    .map(function(e) { return e[0]; });

  // Add bigrams that appear 2+ times
  var bigramFreq = {};
  bigrams.forEach(function(b) { bigramFreq[b] = (bigramFreq[b] || 0) + 1; });
  var topBigrams = Object.entries(bigramFreq)
    .filter(function(e) { return e[1] >= 2; })
    .sort(function(a, b) { return b[1] - a[1]; })
    .slice(0, 20)
    .map(function(e) { return e[0]; });

  return sorted.concat(topBigrams);
}

function previewCvKeywords() {
  var cvText = getCvText();
  var keywords = extractCvKeywords(cvText);
  var ui = SpreadsheetApp.getUi();
  ui.alert(
    "CV Keywords Extracted (" + keywords.length + ")",
    keywords.slice(0, 40).join(", ") + (keywords.length > 40 ? "..." : ""),
    ui.ButtonSet.OK
  );
}

// ─── Keyword pre-filter ──────────────────────────────────────────────────────
/**
 * Returns true if the job title+description contains at least one CV keyword
 * AND does NOT contain any exclude keywords.
 */
function passesKeywordFilter(title, description, cvKeywords, excludeKeywords) {
  var text = (title + " " + description).toLowerCase();

  // Exclude filter (e.g. "senior", "director" if you don't want those)
  for (var i = 0; i < excludeKeywords.length; i++) {
    if (excludeKeywords[i] && text.includes(excludeKeywords[i])) return false;
  }

  // Must match at least 2 CV keywords
  var matches = 0;
  for (var j = 0; j < cvKeywords.length; j++) {
    if (text.includes(cvKeywords[j])) {
      matches++;
      if (matches >= 2) return true;
    }
  }
  return false;
}

// ─── Gemini API call ─────────────────────────────────────────────────────────
function callGemini(prompt, apiKey) {
  var payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 300,
    },
  };

  var options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };

  var response = UrlFetchApp.fetch(GEMINI_URL + "?key=" + apiKey, options);
  var code = response.getResponseCode();
  if (code !== 200) {
    throw new Error("Gemini API error " + code + ": " + response.getContentText());
  }

  var data = JSON.parse(response.getContentText());
  return data.candidates[0].content.parts[0].text;
}

/**
 * Build the matching prompt for Gemini.
 * Asks for JSON output: { score: 0-100, reason: "..." }
 */
function buildMatchPrompt(cvText, jobTitle, jobCompany, jobDescription) {
  return [
    "You are a job-matching assistant. Compare the candidate CV with the job description.",
    "Return ONLY a JSON object with two fields:",
    '  { "score": <integer 0-100>, "reason": "<one sentence max 20 words>" }',
    "",
    "Scoring guide:",
    "  90-100 = Almost perfect match (>80% of key requirements met)",
    "  70-89  = Strong match (60-80% met)",
    "  50-69  = Moderate match (40-60% met, worth considering)",
    "  30-49  = Weak match (<40% met)",
    "  0-29   = Poor match",
    "",
    "=== CANDIDATE CV ===",
    cvText.substring(0, 3000),  // truncate very long CVs
    "",
    "=== JOB: " + jobTitle + " at " + jobCompany + " ===",
    jobDescription.substring(0, 2000),
    "",
    "Return only the JSON, no markdown fences, no other text.",
  ].join("\n");
}

/**
 * Parse Gemini's response into { score, reason }.
 * Handles cases where the model wraps in markdown code fences.
 */
function parseGeminiResponse(text) {
  // Strip markdown fences if present
  var clean = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  try {
    var obj = JSON.parse(clean);
    return {
      score:  Math.min(100, Math.max(0, parseInt(obj.score, 10) || 0)),
      reason: (obj.reason || "").toString().trim(),
    };
  } catch (e) {
    // Fallback: try to extract score with regex
    var match = clean.match(/"score"\s*:\s*(\d+)/);
    var reasonMatch = clean.match(/"reason"\s*:\s*"([^"]+)"/);
    return {
      score:  match ? parseInt(match[1], 10) : 0,
      reason: reasonMatch ? reasonMatch[1] : "Could not parse response",
    };
  }
}

// ─── Core scoring logic ──────────────────────────────────────────────────────
function scoreJobs(onlyNew) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var rawSheet = ss.getSheetByName("Raw Jobs");
  if (!rawSheet) {
    SpreadsheetApp.getUi().alert("No 'Raw Jobs' sheet found.");
    return;
  }

  var config   = getConfig();
  var cvText   = getCvText();
  var apiKey   = getGeminiKey();
  var keywords = extractCvKeywords(cvText);

  var data       = rawSheet.getDataRange().getValues();
  var header     = data[0];
  var rows       = data.slice(1);
  var totalRows  = rows.length;
  var processed  = 0;
  var skipped    = 0;
  var scored     = 0;

  // Ensure Shortlisted sheet exists
  var shortlistSheet = ss.getSheetByName(config.shortlistTab);
  if (!shortlistSheet) {
    shortlistSheet = ss.insertSheet(config.shortlistTab);
    shortlistSheet.appendRow([
      "Scored At", "Score", "Title", "Company", "Location",
      "Job Type", "Salary Min", "Salary Max", "URL", "Match Reason",
    ]);
  }

  // Collect existing shortlisted URLs to avoid duplicates
  var shortlistData = shortlistSheet.getDataRange().getValues();
  var shortlistedUrls = new Set(
    shortlistData.slice(1).map(function(r) { return r[8]; })
  );

  Logger.log("Total rows: " + totalRows + " | Keywords extracted: " + keywords.length);

  for (var i = 0; i < rows.length; i++) {
    var row       = rows[i];
    var rowIndex  = i + 2; // 1-based, +1 for header

    var title       = row[COL.title]       ? row[COL.title].toString()       : "";
    var company     = row[COL.company]     ? row[COL.company].toString()     : "";
    var description = row[COL.description] ? row[COL.description].toString() : "";
    var url         = row[COL.url]         ? row[COL.url].toString()         : "";
    var alreadyScored = row[COL.gemini_score] !== "" && row[COL.gemini_score] !== null;

    if (onlyNew && alreadyScored) {
      skipped++;
      continue;
    }

    processed++;

    // Step 1: keyword pre-filter
    var passes = passesKeywordFilter(title, description, keywords, config.excludeKeywords);
    rawSheet.getRange(rowIndex, COL.keyword_match + 1).setValue(passes ? "YES" : "NO");

    if (!passes) {
      rawSheet.getRange(rowIndex, COL.gemini_score + 1).setValue("SKIPPED");
      rawSheet.getRange(rowIndex, COL.gemini_reason + 1).setValue("Filtered out by keyword pre-filter");
      rawSheet.getRange(rowIndex, COL.shortlisted + 1).setValue("NO");
      continue;
    }

    // Step 2: Gemini scoring
    try {
      var prompt   = buildMatchPrompt(cvText, title, company, description);
      var response = callGemini(prompt, apiKey);
      var result   = parseGeminiResponse(response);

      rawSheet.getRange(rowIndex, COL.gemini_score + 1).setValue(result.score);
      rawSheet.getRange(rowIndex, COL.gemini_reason + 1).setValue(result.reason);

      var isShortlisted = result.score >= config.threshold;
      rawSheet.getRange(rowIndex, COL.shortlisted + 1).setValue(isShortlisted ? "YES" : "NO");

      // Colour-code the score cell
      var scoreCell = rawSheet.getRange(rowIndex, COL.gemini_score + 1);
      if (result.score >= 80)      scoreCell.setBackground("#c6efce"); // green
      else if (result.score >= 60) scoreCell.setBackground("#ffeb9c"); // yellow
      else                         scoreCell.setBackground("#ffc7ce"); // red

      // Add to Shortlisted tab if above threshold
      if (isShortlisted && !shortlistedUrls.has(url)) {
        shortlistSheet.appendRow([
          new Date().toISOString().split("T")[0],
          result.score,
          title,
          company,
          row[COL.location],
          row[COL.job_type],
          row[COL.salary_min],
          row[COL.salary_max],
          url,
          result.reason,
        ]);
        shortlistedUrls.add(url);
      }

      scored++;
      Logger.log("[" + rowIndex + "] " + title + " → " + result.score + "%");

      // Gemini free tier: 15 req/min → safe at ~1 per 4 seconds
      Utilities.sleep(4000);

    } catch (err) {
      Logger.log("Error on row " + rowIndex + ": " + err.message);
      rawSheet.getRange(rowIndex, COL.gemini_reason + 1).setValue("Error: " + err.message);
    }
  }

  SpreadsheetApp.getUi().alert(
    "Done!\n\n" +
    "Processed: " + processed + "\n" +
    "Skipped (already scored): " + skipped + "\n" +
    "AI scored: " + scored + "\n" +
    "Shortlisted (≥" + config.threshold + "%): " + shortlistSheet.getLastRow() + "\n\n" +
    "Check the '" + config.shortlistTab + "' tab for results."
  );
}

function scoreNewJobs()  { scoreJobs(true);  }
function scoreAllJobs()  { scoreJobs(false); }

// ─── Utility: clear all scores (reset) ───────────────────────────────────────
function clearScores() {
  var ui = SpreadsheetApp.getUi();
  var confirm = ui.alert(
    "Clear all scores?",
    "This will remove all Gemini scores, reasons, and shortlist flags from 'Raw Jobs'. Continue?",
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;

  var rawSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Raw Jobs");
  if (!rawSheet) return;

  var lastRow = rawSheet.getLastRow();
  if (lastRow < 2) return;

  rawSheet.getRange(2, COL.keyword_match + 1, lastRow - 1, 4).clearContent();
  rawSheet.getRange(2, COL.gemini_score  + 1, lastRow - 1, 1).setBackground(null);

  ui.alert("Scores cleared. Run 'Score New Jobs' to re-score.");
}

// ─── Optional: daily time-based trigger setup ─────────────────────────────────
/**
 * Run this function ONCE from the Apps Script editor to install a daily trigger.
 * After that, scoring runs automatically every day at 8 AM.
 */
function installDailyTrigger() {
  // Remove existing triggers to avoid duplicates
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === "scoreNewJobs") {
      ScriptApp.deleteTrigger(t);
    }
  });

  ScriptApp.newTrigger("scoreNewJobs")
    .timeBased()
    .everyDays(1)
    .atHour(8)
    .create();

  SpreadsheetApp.getUi().alert("Daily trigger installed! Scoring will run every day at 8 AM.");
}
