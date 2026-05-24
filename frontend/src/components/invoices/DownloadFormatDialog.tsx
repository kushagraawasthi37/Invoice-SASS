import { useQuery } from '@tanstack/react-query';
import { FileText, Palette, Loader2, Check } from 'lucide-react';
import { templateApi } from '@/api/template.api';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (templateId?: string) => void;
  isDownloading: boolean;
  downloadingTemplateId?: string | null;
}

export function DownloadFormatDialog({
  open,
  onClose,
  onSelect,
  isDownloading,
  downloadingTemplateId,
}: Props) {
  const { data: templates, isLoading } = useQuery({
    queryKey: ['templates'],
    queryFn: templateApi.list,
    enabled: open,
    staleTime: 60_000,
  });

  const readyTemplates = templates?.filter((t) => t.analysisStatus === 'READY') ?? [];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !isDownloading) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Choose download format</DialogTitle>
          <DialogDescription>
            Select how you'd like this invoice formatted.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-2 mt-1">
            {/* Generic format */}
            <FormatOption
              icon={<FileText className="w-4 h-4 text-muted-foreground" />}
              iconBg="bg-muted"
              title="Generic format"
              description="Clean standard invoice layout"
              isLoading={isDownloading && downloadingTemplateId === null}
              disabled={isDownloading}
              onClick={() => onSelect(undefined)}
            />

            {/* Custom templates */}
            {readyTemplates.length > 0 && (
              <>
                <div className="flex items-center gap-2 pt-1">
                  <div className="flex-1 h-px bg-border" />
                  <p className="text-[11px] font-medium text-muted-foreground tracking-wide uppercase">
                    Custom templates
                  </p>
                  <div className="flex-1 h-px bg-border" />
                </div>
                {readyTemplates.map((t) => (
                  <FormatOption
                    key={t.id}
                    icon={<Palette className="w-4 h-4 text-white" />}
                    iconBg="rounded-lg"
                    iconStyle={{ background: t.brandColor || '#2c5f2e' }}
                    title={t.name}
                    description={t.description || 'Custom branded template'}
                    isLoading={isDownloading && downloadingTemplateId === t.id}
                    disabled={isDownloading}
                    onClick={() => onSelect(t.id)}
                  />
                ))}
              </>
            )}
          </div>
        )}

        <Button
          variant="ghost"
          className="w-full mt-1 text-muted-foreground"
          onClick={onClose}
          disabled={isDownloading}
        >
          Cancel
        </Button>
      </DialogContent>
    </Dialog>
  );
}

interface FormatOptionProps {
  icon: React.ReactNode;
  iconBg: string;
  iconStyle?: React.CSSProperties;
  title: string;
  description: string;
  isLoading: boolean;
  disabled: boolean;
  onClick: () => void;
}

function FormatOption({
  icon, iconBg, iconStyle, title, description, isLoading, disabled, onClick,
}: FormatOptionProps) {
  return (
    <button
      type="button"
      className={cn(
        'w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all',
        'border-border hover:border-brand-400 hover:bg-brand-50/50',
        disabled && !isLoading && 'opacity-60 pointer-events-none',
        isLoading && 'border-brand-400 bg-brand-50',
      )}
      onClick={onClick}
      disabled={disabled}
    >
      <div
        className={cn('w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0', iconBg)}
        style={iconStyle}
      >
        {isLoading
          ? <Loader2 className="w-4 h-4 animate-spin text-brand-500" />
          : icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{title}</p>
        <p className="text-xs text-muted-foreground truncate">{description}</p>
      </div>
      {isLoading && <Check className="w-4 h-4 text-brand-500 flex-shrink-0" />}
    </button>
  );
}
