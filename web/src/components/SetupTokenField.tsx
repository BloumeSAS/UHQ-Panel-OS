import { useEffect, useState } from 'react';
import axios from 'axios';
import { KeyRound } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { Input, Label } from '@/components/ui';

const KEY = 'uhq_setup_token';

/**
 * Jeton d'installation (variable serveur SETUP_TOKEN). Affiché seulement si le serveur l'exige ;
 * la valeur est gardée pour l'onglet (sessionStorage) et envoyée en en-tête `x-setup-token`.
 */
export function SetupTokenField({ required }: { required?: boolean }) {
  const t = useT();
  const [value, setValue] = useState('');

  useEffect(() => {
    let saved = '';
    try {
      saved = sessionStorage.getItem(KEY) ?? '';
    } catch {
      /* ignore */
    }
    setValue(saved);
    if (saved) axios.defaults.headers.common['x-setup-token'] = saved;
  }, []);

  if (!required) return null;

  const onChange = (v: string) => {
    setValue(v);
    axios.defaults.headers.common['x-setup-token'] = v.trim();
    try {
      sessionStorage.setItem(KEY, v.trim());
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="space-y-1.5 rounded-lg border border-primary/30 bg-primary/5 p-3">
      <Label className="flex items-center gap-1.5">
        <KeyRound className="h-3.5 w-3.5" />
        {t('setupToken.label')}
      </Label>
      <Input type="password" value={value} onChange={(e) => onChange(e.target.value)} autoComplete="off" />
      <p className="text-xs text-muted-foreground">{t('setupToken.hint')}</p>
    </div>
  );
}
