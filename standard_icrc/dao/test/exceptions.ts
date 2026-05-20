export type ProjectTestExceptions = {
  skippedSuites: string[];
  expectedFailures: string[];
  notes: string[];
};

export const projectTestExceptions: ProjectTestExceptions = {
  skippedSuites: [],
  expectedFailures: [],
  notes: [
    "No DAO runtime exceptions are currently configured.",
  ],
};
