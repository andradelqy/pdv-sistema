import { LegalPage } from '../components/ui/LegalPage';

export function Termos() {
  return (
    <LegalPage title="Termos de Serviço" lastUpdated="02/09/2026" icon="file">
      <p>
        Bem-vindo ao <strong>Órbita</strong>, um web app de gestão de inventário e vendas. Ao se cadastrar e utilizar nossos serviços, você concorda com os termos e condições abaixo.
      </p>

      <h2>1. Aceitação dos Termos</h2>
      <p>
        Ao criar uma conta, acessar ou utilizar a plataforma <strong>Órbita</strong>, você declara ter lido, compreendido e aceitado integralmente estes Termos de Serviço. Se você não concordar com qualquer parte destes termos, não utilize nossa plataforma.
      </p>

      <h2>2. Descrição do Serviço</h2>
      <p>
        O Órbita é uma ferramenta digital de gestão empresarial que oferece funcionalidades de controle de estoque, registro de vendas, relatórios analíticos e gestão de clientes, acessível via web.
      </p>

      <h2>3. Cadastro e Conta de Usuário</h2>
      <ul>
        <li>Você é responsável por manter a confidencialidade de suas credenciais de acesso (e-mail e senha).</li>
        <li>Você se compromete a fornecer informações verdadeiras, precisas e atualizadas durante o cadastro.</li>
        <li>O Órbita reserva-se o direito de suspender ou encerrar contas que violem estes termos ou que contenham informações falsas.</li>
      </ul>

      <h2>4. Planos de Assinatura e Pagamento</h2>
      <ul>
        <li><strong>Modelo de cobrança:</strong> O acesso às funcionalidades premium do Órbita é realizado mediante <strong>assinatura mensal ou anual</strong> (plano escolhido no momento da contratação).</li>
        <li><strong>Ciclo de faturamento:</strong> O valor da assinatura será cobrado antecipadamente no primeiro dia de cada ciclo (mensal ou anual), de acordo com a forma de pagamento cadastrada (cartão de crédito, boleto ou PIX).</li>
        <li><strong>Alterações de preço:</strong> Poderemos alterar o valor da assinatura a qualquer momento. Notificaremos você com antecedência mínima de 30 dias sobre qualquer mudança tarifária.</li>
        <li><strong>Impostos:</strong> Você é responsável por todos os impostos aplicáveis incidentes sobre a assinatura.</li>
      </ul>

      <h2>5. Cancelamento e Reembolso</h2>
      <ul>
        <li><strong>Cancelamento:</strong> Você pode cancelar sua assinatura a qualquer momento através do painel de configurações da sua conta ou entrando em contato com nosso suporte.</li>
        <li><strong>Efeito do cancelamento:</strong> O cancelamento vigora a partir do final do ciclo de faturamento atual. Você continuará tendo acesso ao plano até o término do período já pago. Não haverá reembolso proporcional por dias não utilizados.</li>
        <li><strong>Política de reembolso:</strong> Oferecemos um período de <strong>teste gratuito de 7 dias</strong> (ou conforme estipulado na campanha vigente). Após a realização da primeira cobrança, <strong>não haverá reembolso</strong> total ou parcial, exceto em caso de falha comprovada do serviço que impeça seu uso por período superior a 72 horas consecutivas.</li>
      </ul>

      <h2>6. Propriedade Intelectual</h2>
      <ul>
        <li>Todo o conteúdo, design, código-fonte, logotipos, marcas e materiais disponíveis na plataforma Órbita são de propriedade exclusiva da nossa empresa ou de nossos licenciantes.</li>
        <li>É proibida a reprodução, distribuição, cópia, engenharia reversa ou criação de obras derivadas baseadas no Órbita sem autorização prévia por escrito.</li>
      </ul>

      <h2>7. Limitação de Responsabilidade</h2>
      <ul>
        <li>O Órbita é fornecido "no estado em que se encontra" ("as is"). Não garantimos que a plataforma estará livre de erros, falhas ou interrupções.</li>
        <li>Em nenhuma hipótese a [Nome da Sua Empresa] será responsável por danos indiretos, incidentais, especiais ou consequenciais, incluindo perda de lucros ou dados, decorrentes do uso ou da impossibilidade de uso da plataforma.</li>
      </ul>

      <h2>8. Conduta Proibida</h2>
      <p>Você concorda em não:</p>
      <ul>
        <li>Utilizar o Órbita para atividades ilegais ou fraudulentas.</li>
        <li>Compartilhar sua senha ou credenciais com terceiros não autorizados.</li>
        <li>Tentar acessar dados de outros usuários ou interferir na integridade da plataforma.</li>
        <li>Utilizar robôs, spiders ou ferramentas automatizadas para extrair dados da plataforma (scraping).</li>
      </ul>

      <h2>9. Suspensão e Rescisão</h2>
      <p>Poderemos suspender ou encerrar sua conta imediatamente, sem aviso prévio, caso:</p>
      <ul>
        <li>Haja atraso no pagamento da assinatura por mais de 15 dias corridos.</li>
        <li>Você viole gravemente quaisquer cláusulas destes Termos.</li>
        <li>Determinado por ordem judicial ou regulatória.</li>
      </ul>

      <h2>10. Alterações nos Termos</h2>
      <p>
        Estes Termos de Serviço poderão ser atualizados periodicamente. A versão revisada entrará em vigor 15 dias após sua publicação em nosso site ou envio por e-mail. O uso contínuo da plataforma após esse prazo constitui aceitação das alterações.
      </p>

      <h2>11. Legislação Aplicável</h2>
      <p>
        Este contrato é regido pelas leis da República Federativa do Brasil. Fica eleito o foro da comarca de [Sua Cidade/Estado] para dirimir quaisquer questões judiciais decorrentes destes Termos.
      </p>

      <h2>12. Contato</h2>
      <p>
        Em caso de dúvidas sobre estes Termos, entre em contato conosco:<br />
      </p>
    </LegalPage>
  );
}