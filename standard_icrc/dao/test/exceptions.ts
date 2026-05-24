export type ProjectTestExceptions = {
  skippedSuites: string[];
  expectedFailures: string[];
  notes: string[];
};

export const projectTestExceptions: ProjectTestExceptions = {
  skippedSuites: [],
  expectedFailures: [],
  notes: ["Fresh DAO surface uses current SPI-100/101/102/103 APIs."],
};
