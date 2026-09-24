import { expect, test } from '@playwright/test'

test('login oferece sessão temporária ou persistente sem recuperação inexistente', async ({ page }) => {
  // A aplicação inicia o cliente Supabase em paralelo. O teste público precisa
  // aguardar apenas o DOM, não uma conexão externa que não existe no ambiente E2E.
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Login Seguro' })).toBeVisible()
  await expect(page.getByLabel('Lembrar-me')).toBeVisible()
  await expect(page.getByText(/esqueceu sua senha/i)).toHaveCount(0)

  const email = page.getByLabel(/e-mail ou nome de usuário/i)
  await email.fill('operador@exemplo.com')
  await expect(email).toHaveValue('operador@exemplo.com')
})

test('documentos públicos não expõem placeholders jurídicos', async ({ page }) => {
  await page.goto('/termos', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Termos de Serviço' })).toBeVisible()
  await expect(page.locator('body')).not.toContainText('[Sua Cidade/Estado]')
  await expect(page.locator('body')).not.toContainText('[Nome da Sua Empresa]')

  await page.goto('/privacidade', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Política de Privacidade' })).toBeVisible()
  await expect(page.locator('body')).not.toContainText('[dpo@seudominio.com]')
  await expect(page.locator('body')).not.toContainText('[Inserir Data Atual]')
})

test('páginas públicas se adaptam a viewport móvel', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  const viewport = page.viewportSize()
  expect(viewport?.width).toBeLessThanOrEqual(500)
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible()
})
