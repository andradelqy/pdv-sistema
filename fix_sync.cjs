const fs = require('fs');
let code = fs.readFileSync('src/lib/store.ts', 'utf8');

const fx = ['upsertProduto', 'deleteProduto', 'insertMovimentacao', 'deleteMovimentacao',
            'insertVenda', 'upsertCliente', 'deleteCliente', 'upsertCaixa',
            'insertCaixaEntrada', 'upsertEntrega'];

fx.forEach(fn => {
    // Regex pra capturar trySync(() => sync.funcao(args))
    // Nota: A substituição precisa ser tratada cautelosamente
    const regex = new RegExp('trySync\\(\\(\\) => sync\\.' + fn + '\\(([^)]+)\\)\\)', 'g');
    
    // Substitui pelo novo formato: trySync('funcao', [args, useStore.getState().lojaId], sync.funcao)
    code = code.replace(regex, (match, args) => {
        return `trySync('${fn}', [${args}, useStore.getState().lojaId], sync.${fn})`;
    });
});

fs.writeFileSync('src/lib/store.ts', code);
