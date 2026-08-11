export type OnboardingStep = 1 | 2;

export type BrandingData = {
  organizationName: string;
  logoUri?: string;
  primaryColor: string;
  themePreset: string;
};

export type ProjectData = {
  projectName: string;
  projectDescription: string;
};

export type DataSourceData = {
  websiteUrl: string;
  crawlDepth: '1' | '2' | '3';
  crawlFrequency: 'once' | 'daily' | 'weekly';
  headless: boolean;
  crawlStatus: 'idle' | 'processing' | 'completed' | 'invalid';
  crawlMessage?: string;
};

export type QuickTestData = {
  question: string;
  answer?: string | null;
};

export type OnboardingForm = {
  branding: BrandingData;
  project: ProjectData;
  dataSource: DataSourceData;
  quickTest: QuickTestData;
};
