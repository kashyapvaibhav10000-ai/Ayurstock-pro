import { prisma } from '@/lib/db';

export interface ImportJob {
  id: string;
  status: 'processing' | 'done' | 'error';
  currentPage: number;
  totalPages: number;
  medicines: any[];
  message?: string;
  error?: string;
}

class ImportJobStore {
  async createJob(jobId: string, totalPages: number): Promise<ImportJob> {
    const job = await prisma.importJob.create({
      data: {
        id: jobId,
        status: 'processing',
        currentPage: 0,
        totalPages,
        medicines: '[]', // Start with empty array as JSON string
      },
    });

    return {
      id: job.id,
      status: job.status as ImportJob['status'],
      currentPage: job.currentPage,
      totalPages: job.totalPages,
      medicines: JSON.parse(job.medicines || '[]'),
      message: job.message || undefined,
      error: job.error || undefined,
    };
  }

  async updateJob(jobId: string, updates: Partial<ImportJob>): Promise<void> {
    const data: any = {};

    if (updates.status !== undefined) data.status = updates.status;
    if (updates.currentPage !== undefined) data.currentPage = updates.currentPage;
    if (updates.totalPages !== undefined) data.totalPages = updates.totalPages;
    if (updates.medicines !== undefined) data.medicines = JSON.stringify(updates.medicines);
    if (updates.message !== undefined) data.message = updates.message;
    if (updates.error !== undefined) data.error = updates.error;

    await prisma.importJob.update({
      where: { id: jobId },
      data,
    });
  }

  async getJob(jobId: string): Promise<ImportJob | undefined> {
    const job = await prisma.importJob.findUnique({
      where: { id: jobId },
    });

    if (!job) return undefined;

    return {
      id: job.id,
      status: job.status as ImportJob['status'],
      currentPage: job.currentPage,
      totalPages: job.totalPages,
      medicines: JSON.parse(job.medicines || '[]'),
      message: job.message || undefined,
      error: job.error || undefined,
    };
  }

  async deleteJob(jobId: string): Promise<void> {
    await prisma.importJob.delete({
      where: { id: jobId },
    });
  }

  async deleteOldJobs(): Promise<void> {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    await prisma.importJob.deleteMany({
      where: {
        createdAt: {
          lt: twentyFourHoursAgo,
        },
      },
    });
  }

  async markStaleJobsAsError(): Promise<void> {
    // Mark jobs that were processing but server restarted as error
    await prisma.importJob.updateMany({
      where: {
        status: 'processing',
      },
      data: {
        status: 'error',
        error: 'Server restarted during processing. Please try again.',
      },
    });
  }

  // Initialize cleanup on module load
  private initCleanup() {
    // Run cleanup on startup
    this.deleteOldJobs().catch(console.error);
    this.markStaleJobsAsError().catch(console.error);

    // Run cleanup every hour
    setInterval(() => {
      this.deleteOldJobs().catch(console.error);
    }, 60 * 60 * 1000); // 1 hour
  }
}

export const importJobStore = new ImportJobStore();
// Initialize cleanup on module load
importJobStore['initCleanup']();