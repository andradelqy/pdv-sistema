import { LegalPage } from '../components/ui/LegalPage'
import { canalDeContato, legalConfig } from '../config/legal'

export function Privacidade() {
  return (
    <LegalPage title="Política de Privacidade" lastUpdated="23/09/2026" icon="shield">
      <p>Esta política descreve o tratamento de dados no Órbita conforme a Lei nº 13.709/2018 (LGPD). O estabelecimento contratante controla os dados de seus clientes e colaboradores; <strong>{legalConfig.nomeOperador}</strong> opera a plataforma para prestar o serviço.</p>

      <h2>1. Dados tratados</h2>
      <ul>
        <li>Conta: identificador, nome, e-mail, função, loja e status.</li>
        <li>Operação: produtos, estoque, vendas, compras, caixa, entregas e auditoria.</li>
        <li>Clientes do estabelecimento: nome, telefone, e-mail, histórico, crédito, tags e consentimento de ofertas quando cadastrados.</li>
        <li>Localização: somente quando o usuário autoriza o navegador durante ponto ou rastreamento de entrega.</li>
        <li>Diagnóstico: versão, rota, tipo de navegador e detalhes técnicos sanitizados de falhas.</li>
      </ul>
      <p>O Órbita não precisa de número completo de cartão ou CVV e esses dados não devem ser inseridos em campos livres.</p>

      <h2>2. Finalidades e bases</h2>
      <p>Os dados são usados para autenticar usuários, executar o contrato, registrar operações, prevenir fraude, prestar suporte, preservar auditoria e cumprir obrigações legais. Campanhas usam apenas contatos marcados como autorizados pelo estabelecimento.</p>

      <h2>3. Compartilhamento</h2>
      <p>Dados podem ser processados por fornecedores essenciais de infraestrutura, autenticação, armazenamento, monitoramento e comunicação, limitados à prestação do serviço. Também podem ser apresentados por obrigação legal. Dados não são vendidos.</p>

      <h2>4. Segurança</h2>
      <p>São usados HTTPS, autenticação, isolamento por loja, controle de função, políticas de acesso no banco, trilha de auditoria e backups conforme a configuração do ambiente. O contratante continua responsável por suas contas, dispositivos e permissões internas.</p>

      <h2>5. Retenção</h2>
      <p>Dados permanecem pelo prazo necessário ao serviço, à segurança e às obrigações legais. Prazos específicos podem variar conforme a natureza fiscal, trabalhista ou contratual. Solicitações de eliminação são avaliadas considerando essas obrigações.</p>

      <h2>6. Direitos</h2>
      <p>O titular pode solicitar confirmação, acesso, correção, portabilidade quando aplicável, informação sobre compartilhamento, revogação de consentimento e eliminação nos limites legais. Solicitações devem ser enviadas para {canalDeContato(legalConfig.emailPrivacidade)}.</p>

      <h2>7. Armazenamento local e sessão</h2>
      <p>O navegador armazena preferências, sessão quando “Lembrar-me” é ativado, carrinho e operações pendentes de sincronização. Sem essa opção, a sessão termina com o encerramento do navegador. O usuário pode limpar esses dados pelo navegador ou pelas ferramentas do Órbita.</p>

      <h2>8. Alterações e contato</h2>
      <p>Alterações relevantes serão comunicadas. Dúvidas de privacidade devem ser encaminhadas para {canalDeContato(legalConfig.emailPrivacidade)}.</p>
    </LegalPage>
  )
}
