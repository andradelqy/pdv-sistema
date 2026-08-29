import { useState } from 'react';
import { motion } from 'motion/react';
import { supabase } from './lib/supabase';
import { FaUser, FaLock } from 'react-icons/fa';
import DarkVeil from './components/ui/DarkVeil';
import SpecularButton from './components/ui/SpecularButton';
import ShinyText from './components/ui/ShinyText';

export function Login() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setCarregando(true);
    setErro('');

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: senha,
    });

    if (error) setErro('Credenciais inválidas.');
    setCarregando(false);
  };

  // Variantes de animação para os filhos com stagger
  const containerVariants: any = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2, // atraso de 0.2s entre cada filho
        delayChildren: 0.1,   // atraso inicial
      },
    },
  };

  const itemVariants: any = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.6,
        ease: [0.22, 1, 0.36, 1], // curva suave (ease-out)
      },
    },
  };

  return (
    <div className="relative min-h-screen w-full bg-black overflow-hidden">
      {/* Fundo DarkVeil - fade-in rápido */}
      <motion.div
        className="absolute inset-0 z-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8 }}
      >
        <DarkVeil
          hueShift={209}
          noiseIntensity={0.04}
          scanlineIntensity={0.01}
          speed={0.9}
          scanlineFrequency={2.1}
          warpAmount={1.5}
          resolutionScale={1}
        />
      </motion.div>

      {/* Container do formulário com animação em cascata */}
      <motion.div
        className="relative z-10 flex items-center justify-center min-h-screen p-4"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <div className="w-full max-w-md px-8 py-12 rounded-2xl bg-white/5 backdrop-blur-md shadow-2xl">
          {/* Título com ShinyText */}
          <motion.div variants={itemVariants} className="flex justify-center mb-10">
            <ShinyText
              text="Bem vindo."
              color="#f5f5f5"
              shineColor="#EAB308"
              speed={5.5}
              delay={2.5}
              spread={95}
              direction="left"
              yoyo
              pauseOnHover
              className="text-4xl font-bold tracking-widest"
            />
          </motion.div>

          <form onSubmit={handleLogin}>
            {erro && (
              <motion.div
                variants={itemVariants}
                className="bg-red-500/20 text-red-200 text-sm text-center font-medium p-3 rounded-md mb-4 border border-red-400/30"
              >
                {erro}
              </motion.div>
            )}

            {/* Campo E-mail */}
            <motion.div variants={itemVariants} className="relative mb-8">
              <FaUser className="absolute left-0 top-3.5 text-white/60 transition-colors peer-focus:text-amber-400" />
              <input
                id="email"
                type="email"
                className="w-full bg-transparent border-b border-white/40 text-white py-3 pl-8 pr-2 outline-none transition-colors focus:border-amber-400 peer"
                placeholder=" "
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <label
                htmlFor="email"
                className="absolute left-8 top-3 text-white/80 text-sm transition-all duration-300 peer-focus:-top-4 peer-focus:text-xs peer-focus:text-amber-400 peer-valid:-top-4 peer-valid:text-xs peer-valid:text-amber-400"
              >
                E-mail
              </label>
            </motion.div>

            {/* Campo Senha */}
            <motion.div variants={itemVariants} className="relative mb-8">
              <FaLock className="absolute left-0 top-3.5 text-white/60 transition-colors peer-focus:text-amber-400" />
              <input
                id="password"
                type="password"
                className="w-full bg-transparent border-b border-white/40 text-white py-3 pl-8 pr-2 outline-none transition-colors focus:border-amber-400 peer"
                placeholder=" "
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                required
              />
              <label
                htmlFor="password"
                className="absolute left-8 top-3 text-white/80 text-sm transition-all duration-300 peer-focus:-top-4 peer-focus:text-xs peer-focus:text-amber-400 peer-valid:-top-4 peer-valid:text-xs peer-valid:text-amber-400"
              >
                Senha
              </label>
            </motion.div>

            {/* Botão SpecularButton */}
            <motion.div variants={itemVariants}>
              <SpecularButton
                type="submit"
                size="lg"
                radius={18}
                tint="#ffffff"
                tintOpacity={0}
                blur={0}
                textColor="#f5f5f5"
                lineColor="#EAB308"
                baseColor="#000000"
                intensity={1.2}
                shineSize={10}
                shineFade={40}
                thickness={1}
                speed={0.35}
                followMouse
                proximity={250}
                autoAnimate={false}
                disabled={carregando}
                className="w-full"
              >
                {carregando ? 'Verificando...' : 'Entrar'}
              </SpecularButton>
            </motion.div>
          </form>
        </div>
      </motion.div>
    </div>
  );
}