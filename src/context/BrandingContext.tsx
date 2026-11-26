import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

const LOGO_STORAGE_KEY = 'bajrang_pharmacy_logo';
const PHARMACY_NAME = 'Bajrang Pharmacy';
export const DEFAULT_LOGO_URL = '/bajrang-logo.png';
export const DEFAULT_ICON_URL = '/bajrang-icon.png';

interface BrandingContextType {
  pharmacyName: string;
  logoUrl: string;
  iconUrl: string;
  isCustomLogo: boolean;
  isSavingLogo: boolean;
  updateLogo: (logoDataUrl: string | null) => Promise<void>;
  refreshBranding: () => Promise<void>;
}

const BrandingContext = createContext<BrandingContextType | undefined>(undefined);

export const BrandingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [customLogoUrl, setCustomLogoUrl] = useState<string | null>(() => {
    try {
      if (typeof localStorage !== 'undefined') {
        return localStorage.getItem(LOGO_STORAGE_KEY);
      }
    } catch {
      // ignore storage errors
    }
    return null;
  });
  const [isSavingLogo, setIsSavingLogo] = useState(false);

  const refreshBranding = async () => {
    if (!isSupabaseConfigured()) return;

    try {
      const { data: rpcData, error: rpcErr } = await supabase.rpc('get_public_branding');
      if (!rpcErr && rpcData) {
        const remoteLogo = typeof rpcData.logo_data_url === 'string' && rpcData.logo_data_url.trim()
          ? rpcData.logo_data_url
          : null;
        setCustomLogoUrl(remoteLogo);
        if (typeof localStorage !== 'undefined') {
          if (remoteLogo) {
            localStorage.setItem(LOGO_STORAGE_KEY, remoteLogo);
          } else {
            localStorage.removeItem(LOGO_STORAGE_KEY);
          }
        }
        return;
      }

      const { data: settingData } = await supabase
        .from('business_settings')
        .select('setting_value')
        .eq('setting_key', 'branding_config')
        .maybeSingle();

      if (settingData?.setting_value) {
        const val = settingData.setting_value as { logo_data_url?: string | null };
        const remoteLogo = typeof val.logo_data_url === 'string' && val.logo_data_url.trim()
          ? val.logo_data_url
          : null;
        setCustomLogoUrl(remoteLogo);
        if (typeof localStorage !== 'undefined') {
          if (remoteLogo) {
            localStorage.setItem(LOGO_STORAGE_KEY, remoteLogo);
          } else {
            localStorage.removeItem(LOGO_STORAGE_KEY);
          }
        }
      }
    } catch {
      // Non-fatal: keep cached/default logo
    }
  };

  useEffect(() => {
    refreshBranding();
  }, []);

  const updateLogo = async (logoDataUrl: string | null) => {
    setIsSavingLogo(true);
    try {
      if (typeof localStorage !== 'undefined') {
        if (logoDataUrl) {
          localStorage.setItem(LOGO_STORAGE_KEY, logoDataUrl);
        } else {
          localStorage.removeItem(LOGO_STORAGE_KEY);
        }
      }
      setCustomLogoUrl(logoDataUrl);

      if (isSupabaseConfigured()) {
        const payload = {
          logo_data_url: logoDataUrl,
          pharmacy_name: PHARMACY_NAME,
          updated_at: new Date().toISOString(),
        };

        const { data: existing } = await supabase
          .from('business_settings')
          .select('id')
          .eq('setting_key', 'branding_config')
          .maybeSingle();

        if (existing?.id) {
          const { error } = await supabase
            .from('business_settings')
            .update({ setting_value: payload, updated_at: new Date().toISOString() })
            .eq('id', existing.id);
          if (error) throw new Error(error.message);
        } else {
          const { error } = await supabase
            .from('business_settings')
            .insert({
              business_id: 'b0000000-0000-0000-0000-000000000001',
              setting_key: 'branding_config',
              setting_value: payload,
            });
          if (error) throw new Error(error.message);
        }
      }
    } finally {
      setIsSavingLogo(false);
    }
  };

  const value = useMemo(
    () => ({
      pharmacyName: PHARMACY_NAME,
      logoUrl: customLogoUrl || DEFAULT_LOGO_URL,
      iconUrl: customLogoUrl || DEFAULT_ICON_URL,
      isCustomLogo: Boolean(customLogoUrl),
      isSavingLogo,
      updateLogo,
      refreshBranding,
    }),
    [customLogoUrl, isSavingLogo]
  );

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
};

export const useBranding = (): BrandingContextType => {
  const ctx = useContext(BrandingContext);
  if (!ctx) {
    return {
      pharmacyName: PHARMACY_NAME,
      logoUrl: DEFAULT_LOGO_URL,
      iconUrl: DEFAULT_ICON_URL,
      isCustomLogo: false,
      isSavingLogo: false,
      updateLogo: async () => {},
      refreshBranding: async () => {},
    };
  }
  return ctx;
};
