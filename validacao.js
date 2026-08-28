/**
 * Teste de validação pós-correção: testa o fluxo completo com o .env real
 */
require('dotenv').config();
const rotasService = require('./src/rotas/rotas.service');

const cepsTeste = [
  '29149-740', // Com hífen
  '29149740',  // Sem hífen
  '29090120',  // Jardim Camburi, Vitória
  '29102-070', // Serra
  '1234567',   // CEP inválido (7 dígitos)
  '99999999',  // CEP inexistente
];

async function testar(cep) {
  process.stdout.write(`CEP "${cep}": `);
  try {
    const resultado = await rotasService.calcularRotaMaisProxima({
      cepOuEndereco: cep, lat: null, lng: null
    });
    console.log(`✅ Agência mais próxima: ${resultado.destino} | Distância: ${resultado.distanciaFormatada}`);
  } catch (e) {
    console.log(`❌ ${e.message} (status: ${e.statusCode || 'N/A'})`);
  }
}

(async () => {
  console.log('='.repeat(60));
  console.log('VALIDAÇÃO: Fluxo CEP → ViaCEP → Nominatim → Grafo');
  console.log('='.repeat(60));
  for (const cep of cepsTeste) {
    await testar(cep);
    // Respeita rate limit do Nominatim (1 req/s)
    await new Promise(r => setTimeout(r, 1100));
  }
  console.log('='.repeat(60));
})();
