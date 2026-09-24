import { LegalPage } from '../components/ui/LegalPage'
import { canalDeContato, legalConfig } from '../config/legal'

export function Termos() {
  return (
    <LegalPage title="Termos de Serviço" lastUpdated="23/09/2026" icon="file">
      <p>
        Estes termos regulam o uso do <strong>Órbita</strong>, plataforma de gestão de vendas,
        estoque, compras, clientes e entregas operada por <strong>{legalConfig.nomeOperador}</strong>
        {legalConfig.documentoOperador ? `, documento ${legalConfig.documentoOperador}` : ''}.
      </p>

      <h2>1. Aceitação e capacidade</h2>
      <p>Ao usar o Órbita, o contratante declara possuir capacidade para representar o estabelecimento e aceita estes termos. Cada colaborador deve usar sua própria conta e manter suas credenciais protegidas.</p>

      <h2>2. Serviço</h2>
      <p>O Órbita apoia rotinas operacionais e gerenciais. Previsões, alertas e recomendações de compra são instrumentos de decisão e dependem da qualidade do cadastro e do histórico; não substituem conferência humana, contabilidade ou aconselhamento fiscal.</p>

      <h2>3. Responsabilidades do contratante</h2>
      <ul>
        <li>Manter produtos, custos, estoques, usuários e permissões corretos.</li>
        <li>Conferir pedidos, caixa, recebimentos e relatórios antes de decisões financeiras.</li>
        <li>Obter base legal e consentimentos necessários para cadastrar clientes e enviar ofertas.</li>
        <li>Não inserir números completos de cartão, CVV, senhas ou outros segredos no sistema.</li>
      </ul>

      <h2>4. Assinatura e pagamento</h2>
      <p>A contratação e a cobrança são administradas manualmente pelo responsável comercial. Plano, valor, vencimento, período de teste e forma de pagamento são os informados na proposta ou contrato. O Órbita não realiza cobrança automática nem armazena dados de cartão nesta versão.</p>

      <h2>5. Cancelamento</h2>
      <p>O cancelamento ou a não renovação deve ser solicitado por {canalDeContato(legalConfig.emailSuporte)}. Condições de aviso, acesso remanescente e eventual reembolso seguem a proposta comercial e a legislação aplicável.</p>

      <h2>6. Disponibilidade, backup e suporte</h2>
      <p>São adotadas medidas razoáveis de segurança e continuidade, mas nenhum serviço conectado é livre de indisponibilidades. O contratante deve comunicar inconsistências assim que percebê-las e manter os procedimentos operacionais de conferência e contingência acordados.</p>

      <h2>7. Propriedade e uso permitido</h2>
      <p>O software, a marca e os materiais do Órbita permanecem com seus titulares. É proibido tentar contornar controles de acesso, acessar dados de outra loja, distribuir cópias não autorizadas ou usar a plataforma para finalidade ilícita.</p>

      <h2>8. Dados e encerramento</h2>
      <p>Os dados operacionais inseridos pertencem ao contratante. Antes do encerramento, o contratante pode solicitar ou realizar a exportação disponível no sistema. A retenção e a eliminação observam obrigações legais, segurança e a Política de Privacidade.</p>

      <h2>9. Suspensão</h2>
      <p>O acesso pode ser suspenso por inadimplência, risco de segurança, uso abusivo, ordem legal ou violação destes termos, com comunicação quando aplicável.</p>

      <h2>10. Alterações e legislação</h2>
      <p>Alterações materiais serão comunicadas por canal adequado. Aplicam-se as leis brasileiras, inclusive o Código de Defesa do Consumidor quando pertinente, sendo competente o foro definido pela legislação aplicável.</p>

      <h2>11. Contato</h2>
      <p>Questões contratuais ou de suporte devem ser enviadas para {canalDeContato(legalConfig.emailSuporte)}.</p>
    </LegalPage>
  )
}
