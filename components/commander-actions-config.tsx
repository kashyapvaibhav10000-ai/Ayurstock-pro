'use client';

import { useState, useEffect } from 'react';
import * as Icons from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import axios from 'axios';

export type CommanderAction = {
  label: string;
  icon: string;
  route: string;
};

export const DEFAULT_ACTIONS: CommanderAction[] = [
  { label: 'New Prescription', icon: 'Plus', route: '/dashboard/billing' },
  { label: 'Quick Stock', icon: 'Pill', route: '/dashboard/inventory' },
  { label: 'Add Customer', icon: 'Users', route: '/dashboard/credits' },
  { label: 'Daily Report', icon: 'FileText', route: '/dashboard/reports' },
];

export const AVAILABLE_ACTIONS = [
  { label: 'New Prescription', icon: 'Plus', route: '/dashboard/billing' },
  { label: 'Quick Stock', icon: 'Pill', route: '/dashboard/inventory' },
  { label: 'Add Customer', icon: 'Users', route: '/dashboard/credits' },
  { label: 'Daily Report', icon: 'FileText', route: '/dashboard/reports' },
  { label: 'Stock Ledger', icon: 'BookOpen', route: '/dashboard/stock-adjustment' },
  { label: 'New Sale', icon: 'ShoppingCart', route: '/dashboard/billing' },
  { label: 'Suppliers', icon: 'Truck', route: '/dashboard/suppliers' },
  { label: 'Purchases', icon: 'Package', route: '/dashboard/purchases' },
  { label: 'Returns', icon: 'RotateCcw', route: '/dashboard/returns' },
  { label: 'Medicine Database', icon: 'Database', route: '/dashboard/medicines' },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentActions: CommanderAction[];
  onSave: (actions: CommanderAction[]) => void;
}

export default function CommanderActionsConfig({ isOpen, onClose, currentActions, onSave }: Props) {
  const [actions, setActions] = useState<CommanderAction[]>(currentActions);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setActions(currentActions.length > 0 ? currentActions : DEFAULT_ACTIONS);
    }
  }, [isOpen, currentActions]);

  const handleUpdate = (index: number, field: keyof CommanderAction, value: string) => {
    const newActions = [...actions];
    newActions[index] = { ...newActions[index], [field]: value };
    
    // Auto-update icon and route if a predefined label is selected and we changed the label
    if (field === 'label') {
      const predefined = AVAILABLE_ACTIONS.find(a => a.label === value);
      if (predefined) {
        newActions[index].icon = predefined.icon;
        newActions[index].route = predefined.route;
      }
    }
    
    setActions(newActions);
  };

  const handleRemove = (index: number) => {
    if (actions.length <= 1) {
      toast.error('Must have at least 1 action');
      return;
    }
    const newActions = [...actions];
    newActions.splice(index, 1);
    setActions(newActions);
  };

  const handleAdd = () => {
    if (actions.length >= 5) {
      toast.error('Maximum 5 actions allowed');
      return;
    }
    setActions([...actions, { ...AVAILABLE_ACTIONS[0] }]);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await axios.patch('/api/settings', { commanderActions: actions });
      if (res.data.success) {
        toast.success('Commander actions updated');
        onSave(res.data.data.commanderActions);
        onClose();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to update actions');
    } finally {
      setIsSaving(false);
    }
  };

  const IconComponent = ({ name }: { name: string }) => {
    const Icon = (Icons as any)[name] || Icons.HelpCircle;
    return <Icon className="w-4 h-4" />;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Configure Commander Actions</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {actions.map((action, index) => (
            <div key={index} className="flex items-center gap-3 p-3 bg-surface border border-border rounded-xl shadow-sm">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 text-primary shrink-0">
                <IconComponent name={action.icon} />
              </div>
              <div className="flex-1 space-y-2">
                <select
                  value={action.label}
                  onChange={(e) => handleUpdate(index, 'label', e.target.value)}
                  className="w-full text-sm font-bold bg-background border border-border rounded-lg px-3 py-2 outline-none focus:border-primary"
                >
                  {AVAILABLE_ACTIONS.map(a => (
                    <option key={a.label} value={a.label}>{a.label}</option>
                  ))}
                  {/* In case they modified label manually, show it so select doesnt break */}
                  {!AVAILABLE_ACTIONS.find(a => a.label === action.label) && (
                    <option value={action.label}>{action.label}</option>
                  )}
                </select>
                <input
                  type="text"
                  value={action.label}
                  onChange={(e) => handleUpdate(index, 'label', e.target.value)}
                  placeholder="Button Label"
                  className="w-full text-xs font-medium bg-background border border-border rounded-lg px-3 py-1.5 outline-none focus:border-primary text-muted-foreground"
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleRemove(index)}
                disabled={actions.length <= 1}
                className="text-danger hover:text-danger hover:bg-danger/10 shrink-0"
              >
                <Icons.Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}

          {actions.length < 5 && (
            <Button
              variant="outline"
              className="w-full border-dashed"
              onClick={handleAdd}
            >
              <Icons.Plus className="w-4 h-4 mr-2" />
              Add Action
            </Button>
          )}
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <Button
            variant="ghost"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => setActions(DEFAULT_ACTIONS)}
            disabled={isSaving}
          >
            Reset to Defaults
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose} disabled={isSaving}>Cancel</Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save Actions'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
