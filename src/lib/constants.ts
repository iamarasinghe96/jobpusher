import { LocationOption } from '@/types';

export const LOCATIONS: LocationOption[] = [
  // Albury-Wodonga region
  {
    id: 'albury',
    label: 'Albury NSW 2640',
    searchTerms: ['Albury NSW', 'Albury 2640'],
    enabled: true,
    region: 'albury-wodonga',
  },
  {
    id: 'wodonga',
    label: 'Wodonga VIC 3690',
    searchTerms: ['Wodonga VIC', 'Wodonga 3690'],
    enabled: true,
    region: 'albury-wodonga',
  },
  {
    id: 'wangaratta',
    label: 'Wangaratta VIC',
    searchTerms: ['Wangaratta VIC'],
    enabled: true,
    region: 'albury-wodonga',
  },
  {
    id: 'chiltern',
    label: 'Chiltern VIC',
    searchTerms: ['Chiltern VIC'],
    enabled: false,
    region: 'albury-wodonga',
  },
  {
    id: 'corowa',
    label: 'Corowa NSW',
    searchTerms: ['Corowa NSW'],
    enabled: false,
    region: 'albury-wodonga',
  },
  // V/Line Corridor
  {
    id: 'benalla',
    label: 'Benalla VIC',
    searchTerms: ['Benalla VIC'],
    enabled: true,
    region: 'vline-corridor',
  },
  {
    id: 'seymour',
    label: 'Seymour VIC',
    searchTerms: ['Seymour VIC'],
    enabled: true,
    region: 'vline-corridor',
  },
  {
    id: 'shepparton',
    label: 'Shepparton VIC',
    searchTerms: ['Shepparton VIC', 'Greater Shepparton'],
    enabled: false,
    region: 'vline-corridor',
  },
  {
    id: 'euroa',
    label: 'Euroa VIC',
    searchTerms: ['Euroa VIC'],
    enabled: false,
    region: 'vline-corridor',
  },
  // Melbourne
  {
    id: 'melbourne-cbd',
    label: 'Melbourne CBD',
    searchTerms: ['Melbourne CBD', 'Melbourne VIC 3000'],
    enabled: true,
    region: 'melbourne',
  },
  {
    id: 'melbourne-metro',
    label: 'Melbourne Metro',
    searchTerms: ['Melbourne VIC', 'Metro Melbourne'],
    enabled: true,
    region: 'melbourne',
  },
  {
    id: 'dandenong',
    label: 'Dandenong / SE Melbourne',
    searchTerms: ['Dandenong VIC', 'South East Melbourne'],
    enabled: false,
    region: 'melbourne',
  },
];

export const JOB_TYPES = [
  'Full-time',
  'Part-time',
  'Contract',
  'Casual',
  'Internship',
  'Remote',
];

export const SAMPLE_CV = `John Smith
Senior Software Engineer

SUMMARY
Experienced software engineer with 8+ years building scalable web applications and APIs.
Strong background in cloud infrastructure, TypeScript, Python, and modern frontend frameworks.

SKILLS
- Languages: TypeScript, JavaScript, Python, Java, SQL
- Frontend: React, Next.js, Vue.js, Tailwind CSS
- Backend: Node.js, Express, FastAPI, Django
- Cloud: AWS (EC2, S3, Lambda, RDS), Azure, GCP
- DevOps: Docker, Kubernetes, CI/CD, Terraform
- Databases: PostgreSQL, MySQL, MongoDB, Redis

EXPERIENCE
Senior Software Engineer | TechCorp Pty Ltd | 2021–Present
- Led development of microservices architecture serving 500k+ users
- Reduced infrastructure costs by 40% through AWS optimisation
- Mentored team of 4 junior developers

Software Engineer | StartupXYZ | 2019–2021
- Built real-time data pipeline processing 1M+ events/day
- Developed React/TypeScript frontend from ground up

EDUCATION
Bachelor of Computer Science | University of Melbourne | 2016

CERTIFICATIONS
- AWS Solutions Architect Associate
- Google Cloud Professional Data Engineer`;
