import { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from './lib/supabase';
import { FaUser, FaLock } from 'react-icons/fa';

// ----------------------------------------------------------------------
// 1. COMPONENTE DE FUNDO WEBGL (shaders animados)
// ----------------------------------------------------------------------
interface WebGLBackgroundProps {
  fragmentShader: string;
  className?: string;
}

const vertexShaderSource = `
  attribute vec2 position;
  varying vec2 v_texCoord;
  void main() {
    v_texCoord = position * 0.5 + 0.5;
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

function WebGLBackground({ fragmentShader, className = '' }: WebGLBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl');
    if (!gl) return;

    const compileShader = (source: string, type: number) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vs = compileShader(vertexShaderSource, gl.VERTEX_SHADER);
    const fs = compileShader(fragmentShader, gl.FRAGMENT_SHADER);
    if (!vs || !fs) return;

    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.useProgram(program);

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    const positions = new Float32Array([
      -1, -1,  1, -1, -1,  1,
      -1,  1,  1, -1,  1,  1,
    ]);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    const positionLoc = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

    const timeLoc = gl.getUniformLocation(program, 'u_time');
    const resLoc = gl.getUniformLocation(program, 'u_resolution');

    let animationFrame: number;

    const render = (time: number) => {
      time *= 0.001;

      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }

      gl.uniform1f(timeLoc, time);
      gl.uniform2f(resLoc, w, h);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
      animationFrame = requestAnimationFrame(render);
    };

    render(0);

    return () => cancelAnimationFrame(animationFrame);
  }, [fragmentShader]);

  return <canvas ref={canvasRef} className={`absolute inset-0 w-full h-full block ${className}`} />;
}

// ----------------------------------------------------------------------
// 2. SHADERS
// ----------------------------------------------------------------------
const leftFragmentShader = `
  precision highp float;
  varying vec2 v_texCoord;
  uniform float u_time;
  uniform vec2 u_resolution;

  vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }

  float snoise(vec2 v){
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
             -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy) );
    vec2 x0 = v -   i + dot(i, C.xx);
    vec2 i1;
    i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod(i, 289.0);
    vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
    + i.x + vec3(0.0, i1.x, 1.0 ));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy),
      dot(x12.zw,x12.zw)), 0.0);
    m = m*m ;
    m = m*m ;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 a0 = x - floor(x + 0.5);
    vec3 g = a0 * vec3(x0.x,x12.x,x12.z) + h * vec3(x0.y,x12.y,x12.w);
    vec3 l = 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
    vec3 prev = vec3(0.1);
    vec3 res = m * g;
    return 130.0 * dot(res, l);
  }

  void main() {
      vec2 uv = v_texCoord;
      vec3 color1 = vec3(0.02, 0.1, 0.2);
      vec3 color2 = vec3(0.04, 0.15, 0.25);
      float noise1 = snoise(uv * 2.0 + u_time * 0.1);
      float noise2 = snoise(uv * 3.0 - u_time * 0.05 + noise1 * 0.5);
      float intensity = smoothstep(-1.0, 1.0, noise2);
      vec3 finalColor = mix(color1, color2, intensity);
      finalColor += noise1 * 0.02;
      gl_FragColor = vec4(finalColor, 1.0);
  }
`;

const rightFragmentShader = `
  precision highp float;
  varying vec2 v_texCoord;
  uniform float u_time;
  uniform vec2 u_resolution;

  vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }

  float snoise(vec2 v){
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
             -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy) );
    vec2 x0 = v -   i + dot(i, C.xx);
    vec2 i1;
    i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod(i, 289.0);
    vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
    + i.x + vec3(0.0, i1.x, 1.0 ));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy),
      dot(x12.zw,x12.zw)), 0.0);
    m = m*m ;
    m = m*m ;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 a0 = x - floor(x + 0.5);
    vec3 g = a0 * vec3(x0.x,x12.x,x12.z) + h * vec3(x0.y,x12.y,x12.w);
    vec3 l = 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
    vec3 prev = vec3(0.1);
    vec3 res = m * g;
    return 130.0 * dot(res, l);
  }

  void main() {
      vec2 uv = v_texCoord;
      vec3 color1 = vec3(0.96, 0.98, 0.99);
      vec3 color2 = vec3(1.0, 1.0, 1.0);
      vec2 pos = uv * 3.0;
      float noise1 = snoise(pos + u_time * 0.05);
      float noise2 = snoise(pos * 2.0 - u_time * 0.02 + noise1);
      float intensity = smoothstep(-1.0, 1.0, noise2);
      vec3 finalColor = mix(color1, color2, intensity);
      float speckle = snoise(uv * 50.0);
      float star = smoothstep(0.8, 1.0, speckle) * smoothstep(-0.5, 0.5, sin(u_time * 2.0 + speckle * 10.0));
      finalColor += star * vec3(0.0, 0.05, 0.08) * 0.5;
      finalColor += noise1 * 0.01;
      gl_FragColor = vec4(finalColor, 1.0);
  }
`;

// ----------------------------------------------------------------------
// 3. COMPONENTE PRINCIPAL Login
// ----------------------------------------------------------------------
export function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setCarregando(true);
    setErro('');

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: senha,
    });

    if (error) {
      setErro('Credenciais inválidas.');
      setCarregando(false);
      return;
    }

    navigate('/', { replace: true });
    setCarregando(false);
  };

  // Variantes para animações com stagger
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15,
        delayChildren: 0.2,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
    },
  };

  const leftVariants = {
    hidden: { opacity: 0, x: -30 },
    visible: {
      opacity: 1,
      x: 0,
      transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] },
    },
  };

  return (
    <div className="relative min-h-screen w-full flex flex-col lg:flex-row overflow-hidden bg-[#0A2540]">
      {/* ========== LADO ESQUERDO – MARCA ========== */}
      <motion.div
        className="relative lg:w-1/2 min-h-[50vh] lg:min-h-screen flex items-center justify-center p-8 lg:p-12 overflow-hidden"
        variants={leftVariants}
        initial="hidden"
        animate="visible"
      >
        <WebGLBackground fragmentShader={leftFragmentShader} />
        <div className="absolute inset-0 pointer-events-none opacity-50 z-0">
          <svg className="absolute top-0 right-0 transform translate-x-1/4 -translate-y-1/4 w-96 h-96 text-[#00A3C4]/30" fill="none" viewBox="0 0 200 200">
            <circle cx="100" cy="100" r="80" stroke="currentColor" strokeWidth="1" />
            <ellipse cx="100" cy="100" rx="95" ry="40" stroke="currentColor" strokeWidth="1" transform="rotate(-30 100 100)" />
            <circle cx="170" cy="60" fill="currentColor" r="4" />
            <circle cx="40" cy="140" fill="currentColor" r="3" />
          </svg>
          <svg className="absolute bottom-0 left-0 transform -translate-x-1/4 translate-y-1/4 w-[500px] h-[500px] text-[#00A3C4]/30" fill="none" viewBox="0 0 200 200">
            <circle cx="100" cy="100" r="70" stroke="currentColor" strokeWidth="1" />
            <ellipse cx="100" cy="100" rx="90" ry="30" stroke="currentColor" strokeWidth="1" transform="rotate(15 100 100)" />
            <circle cx="180" cy="120" fill="currentColor" r="5" />
            <circle cx="20" cy="80" fill="currentColor" r="2" />
          </svg>
        </div>

        <div className="relative z-10 text-white max-w-md">
          <div className="flex items-center space-x-4 mb-6">
            <div className="relative w-24 h-24 flex items-center justify-center">
              <div className="absolute inset-0 bg-white rounded-full" />
              <div className="absolute inset-2 bg-[#0A2540] rounded-full" />
              <svg className="absolute inset-[-10%] w-[120%] h-[120%] text-[#00A3C4]" fill="none" viewBox="0 0 100 100">
                <ellipse cx="50" cy="50" rx="45" ry="15" stroke="currentColor" strokeWidth="3" transform="rotate(-35 50 50)" />
                <circle cx="75" cy="30" fill="currentColor" r="6" />
                <circle cx="25" cy="70" fill="currentColor" r="6" />
              </svg>
            </div>
            <h1 className="text-6xl font-bold tracking-tight">Órbita</h1>
          </div>
          <p className="text-2xl font-normal leading-snug">
            Gerencie seu inventário e vendas<br />com precisão orbital.
          </p>
        </div>
      </motion.div>

      {/* ========== LADO DIREITO – FORMULÁRIO ========== */}
      <div className="relative lg:w-1/2 min-h-[50vh] lg:min-h-screen flex items-center justify-center p-4 sm:p-8 lg:p-12 overflow-hidden bg-[#F3F4F6]">
        <WebGLBackground fragmentShader={rightFragmentShader} className="opacity-80" />

        <div className="absolute inset-0 pointer-events-none z-0 flex items-center justify-center opacity-10">
          <svg className="w-[600px] h-[600px] text-[#00A3C4]" fill="none" viewBox="0 0 200 200">
            <circle cx="100" cy="100" r="80" stroke="currentColor" strokeWidth="0.5" />
            <ellipse cx="100" cy="100" rx="95" ry="40" stroke="currentColor" strokeWidth="0.5" transform="rotate(25 100 100)" />
            <ellipse cx="100" cy="100" rx="95" ry="40" stroke="currentColor" strokeWidth="0.5" transform="rotate(-65 100 100)" />
          </svg>
        </div>

        <motion.div
          className="relative z-10 w-full max-w-md"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <div className="bg-white/70 backdrop-blur-2xl rounded-3xl shadow-[0_20px_50px_-15px_rgba(0,0,0,0.1),_inset_0_1px_1px_rgba(255,255,255,1),_inset_1px_0_1px_rgba(255,255,255,0.7)] p-8 sm:p-12 border border-white/60">
            {/* Cabeçalho */}
            <motion.div variants={itemVariants} className="text-center mb-10">
              <div className="mx-auto flex items-center justify-center h-14 w-14 rounded-full bg-gradient-to-br from-[#00A3C4]/20 to-[#00A3C4]/5 mb-4 border border-white/50 shadow-inner">
                <svg className="h-7 w-7 text-[#00A3C4]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-[#1F2937] tracking-tight">Login Seguro</h2>
            </motion.div>

            <form onSubmit={handleLogin}>
              {erro && (
                <motion.div
                  variants={itemVariants}
                  className="bg-red-500/20 text-red-700 text-sm text-center font-medium p-3 rounded-xl mb-6 border border-red-400/30"
                >
                  {erro}
                </motion.div>
              )}

              <motion.div variants={itemVariants} className="space-y-1 mb-6">
                <label htmlFor="email" className="block text-xs font-semibold tracking-wider uppercase text-[#6B7280]">
                  E-mail ou nome de usuário
                </label>
                <div className="relative">
                  <FaUser className="absolute left-4 top-1/2 -translate-y-1/2 text-[#6B7280] transition-colors peer-focus:text-[#00A3C4]" />
                  <input
                    id="email"
                    type="email"
                    className="w-full pl-10 pr-4 py-3.5 border border-gray-200/50 rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#00A3C4] focus:border-transparent bg-white/80 backdrop-blur-md transition-shadow sm:text-sm"
                    placeholder="Digite seu e-mail"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
              </motion.div>

              <motion.div variants={itemVariants} className="space-y-1 mb-6">
                <label htmlFor="password" className="block text-xs font-semibold tracking-wider uppercase text-[#6B7280]">
                  Senha
                </label>
                <div className="relative">
                  <FaLock className="absolute left-4 top-1/2 -translate-y-1/2 text-[#6B7280] transition-colors peer-focus:text-[#00A3C4]" />
                  <input
                    id="password"
                    type="password"
                    className="w-full pl-10 pr-4 py-3.5 border border-gray-200/50 rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#00A3C4] focus:border-transparent bg-white/80 backdrop-blur-md transition-shadow sm:text-sm"
                    placeholder="••••••••"
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    required
                  />
                </div>
              </motion.div>

              <motion.div variants={itemVariants} className="flex items-center justify-between mt-6">
                <div className="flex items-center">
                  <input
                    id="remember-me"
                    type="checkbox"
                    className="h-4 w-4 text-[#00A3C4] focus:ring-[#00A3C4] border-gray-300 rounded bg-white/50"
                  />
                  <label htmlFor="remember-me" className="ml-2 block text-sm font-medium text-[#1F2937]">
                    Lembrar-me
                  </label>
                </div>
                <div className="text-sm">
                  <a href="#" className="font-semibold text-[#6B7280] hover:text-[#00A3C4] transition-colors">
                    Esqueceu sua senha?
                  </a>
                </div>
              </motion.div>

              <motion.div variants={itemVariants} className="pt-4">
                <button
                  type="submit"
                  disabled={carregando}
                  className="w-full flex justify-center py-3.5 px-4 border border-transparent rounded-xl shadow-lg shadow-[#00A3C4]/20 text-sm font-semibold tracking-wide text-white bg-gradient-to-r from-[#00A3C4] to-[#008ba8] hover:from-[#008ba8] hover:to-cyan-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#00A3C4] transition-all disabled:opacity-70"
                >
                  {carregando ? 'Verificando...' : 'Entrar'}
                </button>
              </motion.div>
            </form>

            {/* Rodapé com links para Termos e Privacidade usando Link do react-router-dom */}
            <motion.div variants={itemVariants} className="mt-12 text-center space-y-3">
              <p className="text-sm font-medium text-[#1F2937]">
                Acesso restrito a colaboradores autorizados.
              </p>
              <p className="text-xs text-[#6B7280]">
                Ao fazer login, você concorda com nossos{' '}
                <Link to="/termos" className="underline hover:text-[#00A3C4] transition-colors">
                  Termos de Serviço
                </Link>{' '}
                e{' '}
                <Link to="/privacidade" className="underline hover:text-[#00A3C4] transition-colors">
                  Política de Privacidade
                </Link>.
              </p>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}