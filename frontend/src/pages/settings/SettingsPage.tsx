import { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Upload, Save, Building2, FileText, Palette, AlertCircle } from 'lucide-react';
import { settingsApi } from '@/api/settings.api';
import { useToast } from '@/store/ui.store';
import { extractError } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { PageHeader } from '@/components/common/PageHeader';
import { CURRENCIES } from '@/lib/constants';

const schema = z.object({
  bizName: z.string().max(200, 'Max 200 characters').optional(),
  abn: z.string().max(20, 'Max 20 characters').optional(),
  email: z.string().email('Enter a valid email address').optional().or(z.literal('')),
  phone: z.string().max(20, 'Max 20 characters').optional(),
  address: z.string().max(500, 'Max 500 characters').optional(),
  website: z.string().url('Enter a valid URL (include https://)').optional().or(z.literal('')),
  providerLabel: z.string().max(50, 'Max 50 characters').optional(),
  clientLabel: z.string().max(50, 'Max 50 characters').optional(),
  defaultProviderTitle: z.string().max(100, 'Max 100 characters').optional(),
  defaultClientName: z.string().max(200, 'Max 200 characters').optional(),
  defaultDescription: z.string().max(500, 'Max 500 characters').optional(),
  defaultRate: z.number({ invalid_type_error: 'Must be a number' }).min(0, 'Rate must be 0 or more').optional(),
  invoicePrefix: z.string().max(10, 'Max 10 characters').optional(),
  currency: z.string().optional(),
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be a valid hex color like #2c5f2e').optional(),
});

type FormData = z.infer<typeof schema>;

const PRESET_COLORS = ['#2c5f2e', '#1a56db', '#1a1814', '#7c3aed', '#db2777', '#d97706', '#059669'];

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="flex items-center gap-1 text-xs text-destructive mt-1">
      <AlertCircle className="w-3 h-3 flex-shrink-0" />
      {message}
    </p>
  );
}

export function SettingsPage() {
  const queryClient = useQueryClient();
  const { success, error, warning } = useToast();
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  const { data: workspace, isLoading } = useQuery({
    queryKey: ['workspace-settings'],
    queryFn: settingsApi.getWorkspace,
  });

  const form = useForm<FormData>({ resolver: zodResolver(schema) });
  const errors = form.formState.errors;

  useEffect(() => {
    if (workspace) {
      form.reset({
        bizName: workspace.bizName,
        abn: workspace.abn,
        email: workspace.email,
        phone: workspace.phone,
        address: workspace.address,
        website: workspace.website,
        providerLabel: workspace.providerLabel,
        clientLabel: workspace.clientLabel,
        defaultProviderTitle: workspace.defaultProviderTitle,
        defaultClientName: workspace.defaultClientName,
        defaultDescription: workspace.defaultDescription,
        defaultRate: Number(workspace.defaultRate),
        invoicePrefix: workspace.invoicePrefix,
        currency: workspace.currency,
        brandColor: workspace.brandColor,
      });
      setLogoPreview(workspace.logoUrl || null);
    }
  }, [workspace]);

  const saveMutation = useMutation({
    mutationFn: settingsApi.updateWorkspace,
    onSuccess: (updated) => {
      form.reset({
        bizName: updated.bizName,
        abn: updated.abn,
        email: updated.email,
        phone: updated.phone,
        address: updated.address,
        website: updated.website,
        providerLabel: updated.providerLabel,
        clientLabel: updated.clientLabel,
        defaultProviderTitle: updated.defaultProviderTitle,
        defaultClientName: updated.defaultClientName,
        defaultDescription: updated.defaultDescription,
        defaultRate: Number(updated.defaultRate),
        invoicePrefix: updated.invoicePrefix,
        currency: updated.currency,
        brandColor: updated.brandColor,
      });
      queryClient.invalidateQueries({ queryKey: ['workspace-settings'] });
      success('Settings saved!', 'Your changes will apply to new invoices.');
    },
    onError: (err) => error('Save failed', extractError(err)),
  });

  const logoMutation = useMutation({
    mutationFn: settingsApi.uploadLogo,
    onSuccess: (url) => {
      setLogoPreview(url);
      queryClient.invalidateQueries({ queryKey: ['workspace-settings'] });
      success('Logo uploaded!');
    },
    onError: (err) => error('Upload failed', extractError(err)),
  });

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      error('File too large', 'Logo must be under 5 MB.');
      e.target.value = '';
      return;
    }
    if (!file.type.startsWith('image/')) {
      error('Invalid file type', 'Please upload a PNG, JPG, or WebP image.');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => setLogoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
    logoMutation.mutate(file);
  };

  const onSubmit = (data: FormData) => saveMutation.mutate(data);

  const onInvalid = () => {
    const fieldErrors = Object.values(form.formState.errors);
    const firstMessage = fieldErrors[0]?.message as string | undefined;
    warning(
      'Please fix the errors below',
      firstMessage ?? 'One or more fields have invalid values.',
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto pb-20">
      <PageHeader
        title="Settings"
        subtitle="Set your business info once — it fills every new invoice automatically."
      />

      <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="space-y-5">
        {/* Business Profile */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-muted-foreground" />
              <CardTitle>Business Profile</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Logo */}
            <div className="space-y-2">
              <Label>Company Logo</Label>
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-xl border border-border flex items-center justify-center overflow-hidden bg-muted/30 flex-shrink-0">
                  {logoPreview ? (
                    <img src={logoPreview} alt="Logo" className="w-full h-full object-contain" />
                  ) : (
                    <Building2 className="w-6 h-6 text-muted-foreground/40" />
                  )}
                </div>
                <div>
                  <input
                    id="logo-upload"
                    type="file"
                    className="hidden"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleLogoChange}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    loading={logoMutation.isPending}
                    onClick={() => (document.getElementById('logo-upload') as HTMLInputElement)?.click()}
                  >
                    <Upload className="w-3.5 h-3.5" />
                    {logoMutation.isPending ? 'Uploading…' : 'Upload Logo'}
                  </Button>
                  <p className="text-xs text-muted-foreground mt-1.5">PNG, JPG, WebP · max 5 MB</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="col-span-1 sm:col-span-2 space-y-1.5">
                <Label>Business / Provider Name</Label>
                <Input
                  {...form.register('bizName')}
                  placeholder="Jane Smith Support Services"
                  error={!!errors.bizName}
                />
                <FieldError message={errors.bizName?.message} />
                <p className="text-xs text-muted-foreground">Appears on all invoices as the provider.</p>
              </div>

              <div className="space-y-1.5">
                <Label>ABN</Label>
                <Input
                  {...form.register('abn')}
                  placeholder="12 345 678 901"
                  error={!!errors.abn}
                />
                <FieldError message={errors.abn?.message} />
              </div>

              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input
                  type="email"
                  {...form.register('email')}
                  placeholder="jane@example.com.au"
                  error={!!errors.email}
                />
                <FieldError message={errors.email?.message} />
              </div>

              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input
                  {...form.register('phone')}
                  placeholder="04XX XXX XXX"
                  error={!!errors.phone}
                />
                <FieldError message={errors.phone?.message} />
              </div>

              <div className="space-y-1.5">
                <Label>Website</Label>
                <Input
                  {...form.register('website')}
                  placeholder="https://example.com"
                  error={!!errors.website}
                />
                <FieldError message={errors.website?.message} />
              </div>

              <div className="col-span-1 sm:col-span-2 space-y-1.5">
                <Label>Address</Label>
                <Input
                  {...form.register('address')}
                  placeholder="123 Any Street, Sydney NSW 2000"
                  error={!!errors.address}
                />
                <FieldError message={errors.address?.message} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Invoice Defaults */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-muted-foreground" />
              <CardTitle>Invoice Defaults</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Invoice Prefix</Label>
              <Input
                {...form.register('invoicePrefix')}
                placeholder="INV"
                maxLength={10}
                error={!!errors.invoicePrefix}
              />
              <FieldError message={errors.invoicePrefix?.message} />
              <p className="text-xs text-muted-foreground">e.g. INV → INV-2026-001</p>
            </div>

            <div className="space-y-1.5">
              <Label>Default Hourly Rate (AUD)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                {...form.register('defaultRate', { valueAsNumber: true })}
                placeholder="50.00"
                error={!!errors.defaultRate}
              />
              <FieldError message={errors.defaultRate?.message} />
            </div>

            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Controller
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Provider Label</Label>
              <Input
                {...form.register('providerLabel')}
                placeholder="Provider"
                error={!!errors.providerLabel}
              />
              <FieldError message={errors.providerLabel?.message} />
            </div>

            <div className="space-y-1.5">
              <Label>Participant Label</Label>
              <Input
                {...form.register('clientLabel')}
                placeholder="NDIS Participant"
                error={!!errors.clientLabel}
              />
              <FieldError message={errors.clientLabel?.message} />
            </div>

            <div className="space-y-1.5">
              <Label>Default Provider Title</Label>
              <Input
                {...form.register('defaultProviderTitle')}
                placeholder="Support Worker"
                error={!!errors.defaultProviderTitle}
              />
              <FieldError message={errors.defaultProviderTitle?.message} />
            </div>

            <div className="col-span-1 sm:col-span-2 space-y-1.5">
              <Label>Default Service Description</Label>
              <Input
                {...form.register('defaultDescription')}
                placeholder="Support Services"
                error={!!errors.defaultDescription}
              />
              <FieldError message={errors.defaultDescription?.message} />
            </div>
          </CardContent>
        </Card>

        {/* Branding */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Palette className="w-4 h-4 text-muted-foreground" />
              <CardTitle>Brand Color</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => form.setValue('brandColor', color, { shouldValidate: true })}
                    className="w-8 h-8 rounded-full border-2 transition-all hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring"
                    style={{
                      background: color,
                      borderColor: form.watch('brandColor') === color ? color : 'transparent',
                      transform: form.watch('brandColor') === color ? 'scale(1.15)' : undefined,
                    }}
                    title={color}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  {...form.register('brandColor')}
                  className="w-8 h-8 rounded cursor-pointer border border-border flex-shrink-0"
                />
                <div className="flex-1 max-w-[140px]">
                  <Input
                    {...form.register('brandColor')}
                    className="font-mono text-xs"
                    placeholder="#2c5f2e"
                    error={!!errors.brandColor}
                  />
                </div>
              </div>
              <FieldError message={errors.brandColor?.message} />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end pt-2">
          <Button type="submit" loading={saveMutation.isPending} className="gap-2 w-full sm:w-auto">
            <Save className="w-4 h-4" />
            Save Settings
          </Button>
        </div>
      </form>
    </div>
  );
}
