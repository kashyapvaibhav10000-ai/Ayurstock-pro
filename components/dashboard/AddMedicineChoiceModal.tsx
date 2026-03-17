'use client';

import { FileText, Keyboard, ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

interface AddMedicineChoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectImport: () => void;
  onSelectManual: () => void;
}

export default function AddMedicineChoiceModal({
  isOpen,
  onClose,
  onSelectImport,
  onSelectManual,
}: AddMedicineChoiceModalProps) {
  const router = useRouter();

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px] rounded-3xl p-6 sm:p-8 bg-surface border-surface-border shadow-2xl">
        <DialogHeader className="mb-6">
          <DialogTitle className="text-2xl font-bold tracking-tight text-text-primary text-center">
            Add New Medicine
          </DialogTitle>
          <DialogDescription className="text-center text-text-secondary mt-2">
            Choose how you would like to add items to your Medicine Master.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <button
            onClick={() => {
              onClose();
              onSelectImport();
            }}
            className="group relative flex items-center gap-5 p-5 rounded-2xl border-2 border-surface-border bg-surface hover:border-primary hover:bg-primary-light/50 transition-all text-left duration-200"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-light text-primary group-hover:bg-primary group-hover:text-white transition-colors">
              <FileText className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-bold text-text-primary group-hover:text-primary transition-colors">
                Import via OCR Image/PDF
              </h3>
              <p className="text-sm text-text-secondary mt-0.5 pr-4">
                Upload a bill or list and let our AI extract the medicines automatically.
              </p>
            </div>
            <div className="shrink-0 text-surface-border group-hover:text-primary transition-colors pr-2">
              <ArrowRight className="h-5 w-5" />
            </div>
          </button>

          <button
            onClick={() => {
              onClose();
              onSelectManual();
            }}
            className="group relative flex items-center gap-5 p-5 rounded-2xl border-2 border-surface-border bg-surface hover:border-secondary-hover hover:bg-surface-muted transition-all text-left duration-200"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-surface-muted text-text-secondary group-hover:bg-slate-200 group-hover:text-text-primary transition-colors">
              <Keyboard className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-bold text-text-primary group-hover:text-slate-800 transition-colors">
                Manual Entry Form
              </h3>
              <p className="text-sm text-text-secondary mt-0.5 pr-4">
                Type in the medicine details, packing, and pricing manually one by one.
              </p>
            </div>
            <div className="shrink-0 text-surface-border group-hover:text-text-primary transition-colors pr-2">
              <ArrowRight className="h-5 w-5" />
            </div>
          </button>
        </div>

        <div className="mt-8 flex justify-center">
          <Button variant="ghost" className="text-text-secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
