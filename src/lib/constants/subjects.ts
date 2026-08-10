/**
 * Programme subject list. Seeded once, then fully editable from Admin.
 * `credits` and `area` are programme defaults and are expected to be adjusted.
 */
export const SUBJECT_SEED: ReadonlyArray<{
  termNumber: 1 | 2 | 3;
  code: string;
  name: string;
  credits: number;
  area: string;
}> = [
  // ---- Term 1 ----
  { termNumber: 1, code: 'DT', name: 'Design Thinking', credits: 3, area: 'Innovation' },
  {
    termNumber: 1,
    code: 'EEB1',
    name: 'Economic Environment for Business-1',
    credits: 3,
    area: 'Economics',
  },
  { termNumber: 1, code: 'ENT', name: 'Entrepreneurship', credits: 3, area: 'Entrepreneurship' },
  { termNumber: 1, code: 'EM', name: 'Entrepreneurs Marketing', credits: 3, area: 'Marketing' },
  { termNumber: 1, code: 'ME', name: 'Maths for Entrepreneurs', credits: 3, area: 'Quantitative' },
  {
    termNumber: 1,
    code: 'IBUS',
    name: 'Individual Behavior and Understanding Self',
    credits: 3,
    area: 'Behavioural Science',
  },
  { termNumber: 1, code: 'MA', name: 'Management Accounting', credits: 3, area: 'Finance' },

  // ---- Term 2 ----
  {
    termNumber: 2,
    code: 'EEB2',
    name: 'Economic Environment for Business 2',
    credits: 3,
    area: 'Economics',
  },
  { termNumber: 2, code: 'BS', name: 'Business Strategy', credits: 3, area: 'Strategy' },
  { termNumber: 2, code: 'BLA', name: 'Business Law', credits: 3, area: 'Legal' },
  { termNumber: 2, code: 'GTM', name: 'Go-To-Market Strategy', credits: 3, area: 'Marketing' },
  { termNumber: 2, code: 'CA', name: 'Cost Accounting', credits: 3, area: 'Finance' },
  { termNumber: 2, code: 'CMM', name: 'Communication', credits: 3, area: 'Communication' },
  { termNumber: 2, code: 'INV', name: 'Innovation Management', credits: 3, area: 'Innovation' },

  // ---- Term 3 ----
  {
    termNumber: 3,
    code: 'BOT',
    name: 'Building Organization and Talent',
    credits: 3,
    area: 'Organisational Behaviour',
  },
  {
    termNumber: 3,
    code: 'FMV',
    name: 'Financial Management and Valuation',
    credits: 3,
    area: 'Finance',
  },
  {
    termNumber: 3,
    code: 'MMO',
    name: 'Managing Marketing Operations',
    credits: 3,
    area: 'Marketing',
  },
  { termNumber: 3, code: 'MOP', name: 'Managing Operations', credits: 3, area: 'Operations' },
  { termNumber: 3, code: 'DAAI', name: 'Data Analytics & AI', credits: 3, area: 'Technology' },
  { termNumber: 3, code: 'INV2', name: 'Innovation-II', credits: 3, area: 'Innovation' },
  { termNumber: 3, code: 'DM', name: 'Digital Marketing', credits: 3, area: 'Marketing' },
];

export const TERM_SEED = [
  { termNumber: 1, name: 'Term 1' },
  { termNumber: 2, name: 'Term 2' },
  { termNumber: 3, name: 'Term 3' },
] as const;
