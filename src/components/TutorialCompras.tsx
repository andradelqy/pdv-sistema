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
                <motion.div initial={{scale:0.9}} animate={{scale:1}} className="bg-card text-card-foreground border border-border p-8 rounded-3xl max-w-lg shadow-2xl relative">
                    <button onClick={onClose} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"><X size={20}/></button>
                    <h2 className="text-2xl font-bold flex items-center gap-2 mb-4 text-emerald-600"><Sparkles/> Como montar seu plano</h2>
                    
                    <div className="text-muted-foreground mb-6 leading-relaxed space-y-4 text-sm">
                        <p>O Órbita cruza vendas, estoque disponível, pedidos abertos, prazo de reposição e risco de ruptura. O orçamento é distribuído primeiro entre os itens mais urgentes.</p>
                        <ol className="list-decimal pl-4 space-y-2">
                            <li><b>Informe o orçamento.</b> Quantidades e saldo mudam automaticamente.</li>
                            <li><b>Revise o plano.</b> “Sugerido” é a necessidade total; “No plano” é o que cabe agora.</li>
                            <li><b>Retire itens se desejar.</b> O dinheiro liberado é realocado nos próximos produtos.</li>
                            <li><b>Gere para aprovação.</b> O pedido só entra no estoque quando o recebimento for confirmado.</li>
                        </ol>
                        <p className="bg-amber-50 p-3 rounded-xl border border-amber-100 text-amber-800">
                            <b>Dica:</b> Use o modo Controlado nas primeiras compras. O modo Automático inclui somente urgências com confiança mínima de 70%.
                        </p>
                    </div>

                    <button onClick={onClose} className="w-full bg-slate-900 text-white rounded-xl p-4 font-bold">Fechar Ajuda</button>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    )
}
