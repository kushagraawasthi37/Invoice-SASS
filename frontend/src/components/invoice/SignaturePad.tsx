import { useRef, useState, useEffect } from 'react';
import { Pen, Upload, Type, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type SigMode = 'draw' | 'upload' | 'type';

interface SignaturePadProps {
  label: string;
  value: string;
  onChange: (dataUrl: string) => void;
  readOnly?: boolean;
}

export function SignaturePad({ label, value, onChange, readOnly }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<SigMode>('draw');
  const [drawing, setDrawing] = useState(false);
  const [typedName, setTypedName] = useState('');

  useEffect(() => {
    if (mode === 'draw' && value?.startsWith('data:image') && canvasRef.current) {
      const img = new Image();
      img.onload = () => {
        const ctx = canvasRef.current?.getContext('2d');
        if (ctx && canvasRef.current) {
          ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
          ctx.drawImage(img, 0, 0);
        }
      };
      img.src = value;
    }
  }, []);

  const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    if (readOnly) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1a1814';
    setDrawing(true);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing || readOnly) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const pos = getPos(e, canvas);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const stopDraw = () => {
    if (!drawing) return;
    setDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) onChange(canvas.toDataURL());
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
    onChange('');
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => onChange(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleTyped = (name: string) => {
    setTypedName(name);
    if (!name) { onChange(''); return; }
    const canvas = document.createElement('canvas');
    canvas.width = 340; canvas.height = 80;
    const ctx = canvas.getContext('2d')!;
    ctx.font = "italic 42px 'DM Serif Display', Georgia, serif";
    ctx.fillStyle = '#1a1814';
    ctx.fillText(name, 10, 55);
    onChange(canvas.toDataURL());
  };

  const tabs: { key: SigMode; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: 'draw', label: 'Draw', icon: Pen },
    { key: 'upload', label: 'Upload', icon: Upload },
    { key: 'type', label: 'Type', icon: Type },
  ];

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{label}</p>
      <div className="flex gap-1 mb-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setMode(t.key)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors border',
              mode === t.key
                ? 'bg-accent border-accent text-accent-foreground'
                : 'border-border text-muted-foreground hover:bg-muted',
            )}
          >
            <t.icon className="w-3 h-3" />
            {t.label}
          </button>
        ))}
      </div>

      {mode === 'draw' && (
        <div>
          <canvas
            ref={canvasRef}
            width={340}
            height={100}
            className="sig-canvas w-full h-24"
            style={{ touchAction: 'none', pointerEvents: readOnly ? 'none' : 'auto', opacity: readOnly ? 0.5 : 1 }}
            onMouseDown={startDraw}
            onMouseMove={draw}
            onMouseUp={stopDraw}
            onMouseLeave={stopDraw}
            onTouchStart={(e) => { e.preventDefault(); startDraw(e); }}
            onTouchMove={(e) => { e.preventDefault(); draw(e); }}
            onTouchEnd={stopDraw}
          />
          {!readOnly && (
            <Button type="button" variant="ghost" size="sm" className="mt-1 h-7 text-xs" onClick={clearCanvas}>
              <Trash2 className="w-3 h-3 mr-1" /> Clear
            </Button>
          )}
        </div>
      )}

      {mode === 'upload' && (
        <div>
          {value ? (
            <div className="border rounded-lg p-3 flex items-center gap-3">
              <img src={value} alt="Signature" className="max-h-16 max-w-[180px] object-contain" />
              {!readOnly && (
                <Button type="button" variant="ghost" size="sm" className="h-7 text-xs ml-auto" onClick={() => onChange('')}>
                  <Trash2 className="w-3 h-3 mr-1" /> Remove
                </Button>
              )}
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center h-20 border border-dashed border-border rounded-lg cursor-pointer hover:bg-muted/40 transition-colors text-muted-foreground">
              <Upload className="w-5 h-5 mb-1" />
              <span className="text-xs">Click to upload signature image</span>
              <input type="file" className="hidden" accept="image/*" onChange={handleUpload} />
            </label>
          )}
        </div>
      )}

      {mode === 'type' && (
        <Input
          type="text"
          placeholder="Type full name"
          value={typedName}
          onChange={(e) => handleTyped(e.target.value)}
          className="font-serif italic text-lg"
          readOnly={readOnly}
        />
      )}
    </div>
  );
}
