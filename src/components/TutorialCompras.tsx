import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, X } from 'lucide-react';

interface HelpModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function TutorialCompras({ isOpen, onClose }: HelpModalProps) {
    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-md">
                <motion.div initial={{scale:0.9}} animate={{scale:1}} className="bg-white p-8 rounded-3xl max-w-lg shadow-2xl relative">
                    <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"><X size={20}/></button>
                    <h2 className="text-2xl font-bold flex items-center gap-2 mb-4 text-emerald-600"><Sparkles/> Agente Sênior de Compras</h2>
                    
                    <div className="text-slate-600 mb-6 leading-relaxed space-y-4 text-sm">
                        <p>O nosso Agente de Compras funciona como um <b>Comprador Sênior</b>, analisando margem, giro, sazonalidade e riscos para maximizar seu lucro.</p>
                        
                        <ul className="list-disc pl-4 space-y-1">
                            <li><b>VEC (Valor Econômico):</b> Prioriza o que dá mais lucro.</li>
                            <li><b>Sazonalidade:</b> Prepara sua loja para épocas de alta.</li>
                            <li><b>Segurança:</b> Você controla o nível de autonomia do sistema.</li>
                        </ul>
                        
                        <p className="bg-amber-50 p-3 rounded-xl border border-amber-100 text-amber-800">
                            <b>Dica:</b> Comece no modo <i>Recomendação</i>. Quando tiver confiança no VEC, você pode delegar mais autonomia ao agente.
                        </p>
                    </div>

                    <button onClick={onClose} className="w-full bg-slate-900 text-white rounded-xl p-4 font-bold">Fechar Ajuda</button>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    )
}
