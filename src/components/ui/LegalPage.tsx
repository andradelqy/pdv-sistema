import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { Shield, FileText } from 'lucide-react';

interface LegalPageProps {
  title: string;
  lastUpdated: string;
  icon?: 'shield' | 'file';
  children: ReactNode;
}

export function LegalPage({ title, lastUpdated, icon = 'file', children }: LegalPageProps) {
  const Icon = icon === 'shield' ? Shield : FileText;

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 sm:p-8 bg-gradient-to-br from-[#F3F4F6] via-white to-[#E6F0F5] relative overflow-hidden">
      {/* Elementos decorativos de fundo (órbitas sutis) */}
      <div className="absolute inset-0 pointer-events-none opacity-20">
        <svg className="absolute top-0 right-0 transform translate-x-1/4 -translate-y-1/4 w-96 h-96 text-[#00A3C4]" fill="none" viewBox="0 0 200 200">
          <circle cx="100" cy="100" r="80" stroke="currentColor" strokeWidth="0.5" />
          <ellipse cx="100" cy="100" rx="95" ry="40" stroke="currentColor" strokeWidth="0.5" transform="rotate(-30 100 100)" />
          <circle cx="170" cy="60" fill="currentColor" r="3" />
        </svg>
        <svg className="absolute bottom-0 left-0 transform -translate-x-1/4 translate-y-1/4 w-[500px] h-[500px] text-[#00A3C4]" fill="none" viewBox="0 0 200 200">
          <circle cx="100" cy="100" r="70" stroke="currentColor" strokeWidth="0.5" />
          <ellipse cx="100" cy="100" rx="90" ry="30" stroke="currentColor" strokeWidth="0.5" transform="rotate(15 100 100)" />
        </svg>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full max-w-4xl"
      >
        <div className="bg-white/80 backdrop-blur-2xl rounded-3xl shadow-[0_20px_50px_-15px_rgba(0,0,0,0.15),_inset_0_1px_1px_rgba(255,255,255,0.8)] border border-white/60 p-8 sm:p-12 lg:p-16">
          {/* Cabeçalho com ícone */}
          <div className="flex items-center gap-4 mb-8">
            <div className="flex items-center justify-center h-14 w-14 rounded-full bg-gradient-to-br from-[#00A3C4]/20 to-[#00A3C4]/5 border border-white/50 shadow-inner flex-shrink-0">
              <Icon className="h-7 w-7 text-[#00A3C4]" />
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold text-[#0A2540] tracking-tight">{title}</h1>
              <p className="text-sm text-[#6B7280] mt-1">
                <strong>Última atualização:</strong> {lastUpdated}
              </p>
            </div>
          </div>

          {/* Conteúdo com tipografia refinada */}
          <div className="prose prose-lg prose-indigo max-w-none
            prose-headings:text-[#0A2540] prose-headings:font-semibold
            prose-h2:text-2xl prose-h2:mt-10 prose-h2:mb-4
            prose-h3:text-xl prose-h3:mt-6 prose-h3:mb-3
            prose-p:text-[#1F2937] prose-p:leading-relaxed
            prose-strong:text-[#0A2540] prose-strong:font-semibold
            prose-ul:text-[#1F2937] prose-li:marker:text-[#00A3C4]
            prose-a:text-[#00A3C4] prose-a:no-underline hover:prose-a:underline
            prose-code:text-[#0A2540] prose-code:bg-[#F3F4F6] prose-code:px-1 prose-code:py-0.5 prose-code:rounded
          ">
            {children}
          </div>

          {/* Rodapé com link para voltar ao login */}
          <div className="mt-12 pt-6 border-t border-gray-200/50 flex flex-col sm:flex-row items-center justify-between gap-4">
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-sm font-medium text-[#6B7280] hover:text-[#00A3C4] transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Voltar para o login
            </Link>
            <p className="text-xs text-[#6B7280]">
              &copy; {new Date().getFullYear()} Órbita. Todos os direitos reservados.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}