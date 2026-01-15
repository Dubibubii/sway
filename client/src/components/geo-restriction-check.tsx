import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Globe, ExternalLink, X, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface GeoRestrictionCheckProps {
  onConfirm: () => void;
}

const RESTRICTED_COUNTRIES = [
  "Afghanistan", "Algeria", "Angola", "Australia", "Belarus", "Belgium", "Bolivia",
  "Bulgaria", "Burkina Faso", "Cameroon", "Canada", "Central African Republic",
  "Côte d'Ivoire", "Cuba", "Democratic Republic of the Congo", "Ethiopia", "France",
  "Haiti", "Iran", "Iraq", "Italy", "Kenya", "Laos", "Lebanon", "Libya", "Mali",
  "Monaco", "Mozambique", "Myanmar", "Namibia", "Nicaragua", "North Korea", "Poland",
  "Russia", "Singapore", "Somalia", "South Sudan", "Sudan", "Syria", "Taiwan",
  "Thailand", "Ukraine", "United Kingdom", "United States", "Venezuela", "Yemen",
  "Zimbabwe"
];

export function GeoRestrictionCheck({ onConfirm }: GeoRestrictionCheckProps) {
  const [showCountries, setShowCountries] = useState(false);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black flex items-center justify-center p-4"
    >
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="w-full max-w-sm bg-zinc-900 rounded-3xl border border-zinc-800 overflow-hidden"
      >
        <div className="p-8 flex flex-col items-center text-center">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center mb-6 shadow-lg">
            <Globe size={40} className="text-white" />
          </div>
          
          <h2 className="text-2xl font-bold text-white mb-3">Before We Start</h2>
          <p className="text-zinc-400 text-base leading-relaxed mb-6">
            Please confirm that you are not located in the United States or any other restricted jurisdiction.
          </p>

          <button
            onClick={() => setShowCountries(!showCountries)}
            className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors mb-4"
            data-testid="button-view-restricted-countries"
          >
            <ExternalLink size={14} />
            View restricted countries
            {showCountries ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          <AnimatePresence>
            {showCountries && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="w-full overflow-hidden"
              >
                <div className="bg-zinc-800/50 rounded-xl p-4 mb-4 max-h-48 overflow-y-auto text-left">
                  <p className="text-xs text-zinc-500 mb-2 font-medium">Restricted Jurisdictions:</p>
                  <div className="flex flex-wrap gap-1">
                    {RESTRICTED_COUNTRIES.map((country) => (
                      <span 
                        key={country}
                        className="text-xs bg-zinc-700/50 text-zinc-300 px-2 py-1 rounded"
                      >
                        {country}
                      </span>
                    ))}
                  </div>
                  <p className="text-[10px] text-zinc-500 mt-3">
                    Per Kalshi's Member Agreement, trading is prohibited for users domiciled in, organized in, or located in these jurisdictions.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="px-6 pb-6 flex flex-col gap-3">
          <Button 
            onClick={onConfirm}
            className="w-full bg-gradient-to-r from-[#1ED78B] to-emerald-600 hover:from-[#19B878] hover:to-emerald-700 text-white font-semibold py-6 text-base"
            data-testid="button-confirm-geo-restriction"
          >
            I confirm I'm not from a restricted country
          </Button>
          
          <p className="text-[11px] text-zinc-500 text-center px-4">
            By continuing, you acknowledge that trading may be restricted based on your location and agree to Kalshi's terms.
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}
