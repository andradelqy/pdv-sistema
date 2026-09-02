import { LegalPage } from '../components/ui/LegalPage';

export function Privacidade() {
  return (
    <LegalPage title="Política de Privacidade" lastUpdated="[Inserir Data Atual]" icon="shield">
      <p>
        A sua privacidade é importante para nós. Esta Política de Privacidade explica como coletamos, usamos, armazenamos e protegemos suas informações pessoais quando você utiliza o <strong>Órbita</strong>, em conformidade com a Lei Geral de Proteção de Dados Pessoais (LGPD - Lei nº 13.709/2018).
      </p>

      <h2>1. Responsável pelo Tratamento dos Dados</h2>
      <p>
        <strong>Órbita</strong> é a entidade responsável pelo tratamento dos seus dados pessoais.<br />
      </p>

      <h2>2. Quais dados coletamos?</h2>
      <p>Ao utilizar o Órbita, podemos coletar as seguintes categorias de dados:</p>
      <ul>
        <li><strong>Dados de identificação:</strong> Nome completo, e-mail, CPF/CNPJ (quando aplicável para emissão de notas fiscais).</li>
        <li><strong>Dados de contato:</strong> Telefone e endereço.</li>
        <li><strong>Dados de pagamento:</strong> Informações de cartão de crédito (processadas exclusivamente por intermediários de pagamento parceiros, como Stripe ou PagSeguro; não armazenamos o CVV ou número completo do cartão em nossos servidores).</li>
        <li><strong>Dados de uso:</strong> Histórico de acesso, logs de IP, tipo de dispositivo e navegador, interações dentro da plataforma (cliques, tempo de sessão).</li>
        <li><strong>Dados de gestão (inseridos por você):</strong> Informações sobre seus produtos, clientes, fornecedores e vendas (estes são seus dados; nós apenas os armazenamos para fornecer o serviço).</li>
      </ul>

      <h2>3. Como utilizamos seus dados?</h2>
      <p>Utilizamos seus dados para as seguintes finalidades:</p>
      <ul>
        <li><strong>Execução do contrato:</strong> Criar e gerenciar sua conta, fornecer suporte técnico e garantir o funcionamento da assinatura.</li>
        <li><strong>Processamento de pagamentos:</strong> Viabilizar a cobrança recorrente e emitir notas fiscais.</li>
        <li><strong>Comunicação:</strong> Enviar avisos importantes sobre sua conta, atualizações do sistema, novidades e campanhas de marketing (você pode optar por não receber e-mails promocionais a qualquer momento).</li>
        <li><strong>Melhoria do serviço:</strong> Analisar o uso da plataforma para corrigir bugs, otimizar a experiência do usuário e desenvolver novas funcionalidades.</li>
        <li><strong>Segurança jurídica:</strong> Cumprir obrigações legais, prevenir fraudes e proteger os direitos da nossa empresa.</li>
      </ul>

      <h2>4. Compartilhamento de Dados</h2>
      <p>
        Nós <strong>NÃO</strong> vendemos ou alugamos seus dados pessoais para terceiros. Compartilhamos suas informações apenas:
      </p>
      <ul>
        <li><strong>Com prestadores de serviços:</strong> Empresas parceiras que nos auxiliam na infraestrutura (hospedagem, servidores), processamento de pagamentos, envio de e-mails e análise de dados, sempre sob rigorosos contratos de confidencialidade.</li>
        <li><strong>Por exigência legal:</strong> Quando necessário para cumprir ordem judicial, lei aplicável ou requisição de autoridades públicas.</li>
      </ul>

      <h2>5. Segurança dos Dados</h2>
      <p>
        Adotamos medidas técnicas e organizacionais adequadas para proteger seus dados contra acesso não autorizado, perda, destruição ou alteração, incluindo criptografia SSL (HTTPS), firewalls e controle de acesso restrito aos nossos colaboradores.
      </p>

      <h2>6. Seus Direitos (LGPD)</h2>
      <p>Como titular dos dados, você tem os seguintes direitos:</p>
      <ul>
        <li><strong>Confirmação e acesso:</strong> Saber se tratamos seus dados e solicitar uma cópia deles.</li>
        <li><strong>Correção:</strong> Atualizar dados incompletos, inexatos ou desatualizados.</li>
        <li><strong>Anonimização, bloqueio ou eliminação:</strong> Solicitar a remoção de dados desnecessários ou tratados em desconformidade com a lei.</li>
        <li><strong>Portabilidade:</strong> Solicitar a transferência dos seus dados para outro fornecedor de serviço (quando tecnicamente viável).</li>
        <li><strong>Revogação do consentimento:</strong> Retirar seu consentimento para tratamentos baseados em consentimento (sem prejudicar a legalidade do tratamento realizado anteriormente).</li>
      </ul>
      <p>Para exercer seus direitos, entre em contato através do e-mail <strong>[dpo@seudominio.com]</strong>.</p>

      <h2>7. Cookies</h2>
      <p>
        Utilizamos cookies essenciais para garantir a autenticação da sua sessão (login) e a segurança da plataforma. Você pode desabilitar os cookies nas configurações do seu navegador, mas isso pode prejudicar o funcionamento de algumas funcionalidades.
      </p>

      <h2>8. Retenção dos Dados</h2>
      <p>
        Manteremos seus dados pessoais apenas pelo tempo necessário para cumprir as finalidades descritas nesta Política, incluindo períodos de retenção legal exigidos pelas leis fiscais e contábeis (por exemplo, 5 anos para fins de comprovante fiscal, conforme Código Civil).
      </p>

      <h2>9. Dados de Menores de Idade</h2>
      <p>
        O Órbita não se destina a menores de 18 anos. Não coletamos intencionalmente dados de menores de idade. Se você é responsável legal e descobrir que um menor forneceu dados a nós, entre em contato para removê-los.
      </p>

      <h2>10. Atualizações desta Política</h2>
      <p>
        Esta Política de Privacidade poderá ser alterada a qualquer momento. Qualquer mudança significativa será comunicada por e-mail ou por meio de um aviso em destaque em nossa plataforma.
      </p>
    </LegalPage>
  );
}