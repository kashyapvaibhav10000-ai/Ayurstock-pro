export interface ImportJob {
  jobId: string;
  status: 'processing' | 'done' | 'error';
  currentPage: number;
  totalPages: number;
  medicines: any[];
  message?: string;
  error?: string;
}

class ImportJobStore {
  private jobs = new Map<string, ImportJob>();

  createJob(jobId: string, totalPages: number): ImportJob {
    const job: ImportJob = {
      jobId,
      status: 'processing',
      currentPage: 0,
      totalPages,
      medicines: [],
    };
    this.jobs.set(jobId, job);
    return job;
  }

  updateJob(jobId: string, updates: Partial<ImportJob>): void {
    const job = this.jobs.get(jobId);
    if (job) {
      Object.assign(job, updates);
    }
  }

  getJob(jobId: string): ImportJob | undefined {
    return this.jobs.get(jobId);
  }

  deleteJob(jobId: string): void {
    this.jobs.delete(jobId);
  }
}

export const importJobStore = new ImportJobStore();