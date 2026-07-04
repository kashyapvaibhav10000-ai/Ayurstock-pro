'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, Pencil, Trash2, Archive, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';

export default function RackLocationsSettings() {
  const [locations, setLocations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    fetchLocations();
  }, []);

  const fetchLocations = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/settings/rack-locations');
      if (res.data.success) {
        setLocations(res.data.data);
        
        // Auto-Seed Defaults if exactly zero locations exist (First Setup)
        if (res.data.data.length === 0) {
          await axios.post('/api/settings/rack-locations', { seedDefault: true });
          const retryRes = await axios.get('/api/settings/rack-locations');
          if (retryRes.data.success) {
            setLocations(retryRes.data.data);
            toast.success('Successfully provisioned default Rack Locations (H1-H5)');
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch rack locations', err);
      toast.error('Failed to load rack locations');
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setEditingId(null);
    setName('');
    setDescription('');
    setIsModalOpen(true);
  };

  const openEditModal = (loc: any) => {
    setEditingId(loc.id);
    setName(loc.name);
    setDescription(loc.description || '');
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Rack Location name is required');
      return;
    }
    
    setActionLoading(true);
    try {
      if (editingId) {
        const res = await axios.put(`/api/settings/rack-locations/${editingId}`, { name, description });
        if (res.data.success) toast.success('Rack Location updated');
      } else {
        const res = await axios.post('/api/settings/rack-locations', { name, description });
        if (res.data.success) toast.success('Rack Location created');
      }
      setIsModalOpen(false);
      fetchLocations();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to save rack location');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to completely delete rack "${name}"?`)) return;
    
    try {
      const res = await axios.delete(`/api/settings/rack-locations/${id}`);
      if (res.data.success) {
        toast.success(`Rack ${name} successfully removed`);
        fetchLocations();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to delete rack location');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-foreground tracking-tight">Physical Rack Locations</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Map out aisles and shelving coordinates to strictly bind physical inventory batches.
          </p>
        </div>
        <Button 
          onClick={openAddModal}
          className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2"
        >
          <Plus className="h-4 w-4" /> Add Blueprint Limit
        </Button>
      </div>

      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-surface-muted border-b border-border text-muted-foreground font-medium tracking-wide text-xs uppercase">
              <tr>
                <th className="px-6 py-4">Blueprint Code</th>
                <th className="px-6 py-4">Description</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {locations.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-6 py-12 text-center text-muted-foreground">
                    <div className="flex flex-col items-center">
                      <Archive className="h-8 w-8 text-muted-foreground mb-3" />
                      <p>No rack locations defined.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                locations.map((loc) => (
                  <tr key={loc.id} className="hover:bg-surface-muted transition-colors">
                    <td className="px-6 py-4 font-bold tracking-wide text-emerald-800">
                      {loc.name}
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">
                      {loc.description || '-'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <Button 
                          variant="outline" 
                          size="icon"
                          onClick={() => openEditModal(loc)}
                        >
                          <Pencil className="h-4 w-4 text-indigo-600" />
                        </Button>
                        <Button 
                          variant="outline" 
                          size="icon"
                          onClick={() => handleDelete(loc.id, loc.name)}
                          className="hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Rack Registration' : 'Register New Rack Coordinates'}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div>
              <Label>Rack Identification Code / Name *</Label>
              <Input
                placeholder="e.g. H1, SHELF-A, BLOCK-B"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 font-mono uppercase"
              />
            </div>
            <div>
              <Label>Location Description (Optional)</Label>
              <Input
                placeholder="e.g. Front store, back corner..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)} disabled={actionLoading}>
              Cancel
            </Button>
            <Button 
              onClick={handleSave} 
              disabled={actionLoading || !name.trim()}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {actionLoading ? 'Saving Mapping...' : 'Lock Location Tuple'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
