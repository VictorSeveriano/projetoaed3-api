/**
 * test-integration.js
 * Testa o fluxo completo de persistência com PostgreSQL.
 * Usa ROLLBACK no final — não deixa dados sujos no banco.
 * Testes de violação de constraint usam SAVEPOINTs.
 */
require('dotenv').config();
const { getClient } = require('../src/database/connection');

let ok = 0;
let fail = 0;

const log = (label, passed, info = '') => {
  if (passed) { console.log(`  ✓ ${label}${info ? ' — ' + info : ''}`); ok++; }
  else        { console.log(`  ✗ ${label}${info ? ' — ' + info : ''}`); fail++; }
};

/** Testa se uma query viola constraint esperada (usa savepoint). */
async function testConstraintViolation(client, label, sql, params, expectedCode = '23505') {
  let violated = false;
  try {
    await client.query('SAVEPOINT sp_ck');
    await client.query(sql, params);
    await client.query('RELEASE SAVEPOINT sp_ck');
  } catch (e) {
    await client.query('ROLLBACK TO SAVEPOINT sp_ck');
    violated = e.code === expectedCode;
  }
  log(label, violated);
}

async function testar() {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    console.log('\n=== TESTE DE INTEGRAÇÃO PostgreSQL ===\n');

    // ---- ENDERECOS ----
    console.log('[ ENDERECOS ]');
    const { rows: [{ id: endId }] } = await client.query(`
      INSERT INTO enderecos (logradouro, numero, bairro, cidade, estado, uf, cep)
      VALUES ('Rua Teste', '100', 'Centro', 'Vitória', 'Espírito Santo', 'ES', '29000000')
      RETURNING id`);
    log('INSERT enderecos', !!endId, endId);
    const { rows: [eRow] } = await client.query('SELECT * FROM enderecos WHERE id=$1', [endId]);
    log('SELECT enderecos', eRow.logradouro === 'Rua Teste');

    // ---- USUARIOS ----
    console.log('\n[ USUARIOS ]');
    const { rows: [{ id: usrId }] } = await client.query(`
      INSERT INTO usuarios (nome, cpf, celular, email, usuario, senha, perfil, endereco_id)
      VALUES ('Test User', '99999999999', '27999999999', 'test@test.local', 'testuser99', 'senha123', 'USUARIO', $1)
      RETURNING id`, [endId]);
    log('INSERT usuarios', !!usrId, usrId);

    const { rows: r1 } = await client.query("SELECT 1 FROM usuarios WHERE cpf='99999999999'");
    log('UNIQUE CPF funcionando', r1.length === 1);

    await testConstraintViolation(client, 'UNIQUE CPF rejeita duplicata', `
      INSERT INTO usuarios (nome, cpf, celular, email, usuario, senha, perfil)
      VALUES ('Dup', '99999999999', '27888888888', 'dup@test.local', 'dupuser', 'senha123', 'USUARIO')`);

    await testConstraintViolation(client, 'CHECK perfil rejeita valor inválido', `
      INSERT INTO usuarios (nome, cpf, celular, email, usuario, senha, perfil)
      VALUES ('X', '11111111111', '27888888888', 'x@test.local', 'xuser', 'senha123', 'INVALIDO')`,
      [], '23514');

    // ---- MOTORISTAS ----
    console.log('\n[ MOTORISTAS ]');
    const { rows: [{ id: motId, status_cadastro: sc }] } = await client.query(`
      INSERT INTO motoristas (usuario_id, cnh, status_cadastro, status_presenca)
      VALUES ($1, '12345678901', 'PENDENTE', 'OFFLINE')
      RETURNING id, status_cadastro`, [usrId]);
    log('INSERT motoristas', !!motId, motId);
    log('statusCadastro=PENDENTE', sc === 'PENDENTE');

    await client.query("UPDATE motoristas SET status_cadastro='APROVADO' WHERE id=$1", [motId]);
    const { rows: [{ status_cadastro: sc2 }] } = await client.query('SELECT status_cadastro FROM motoristas WHERE id=$1', [motId]);
    log('UPDATE statusCadastro→APROVADO', sc2 === 'APROVADO');

    await testConstraintViolation(client, 'CHECK statusCadastro rejeita valor inválido',
      "UPDATE motoristas SET status_cadastro='INVALIDO' WHERE id=$1", [motId], '23514');

    await testConstraintViolation(client, 'UNIQUE CNH rejeita duplicata', `
      INSERT INTO motoristas (usuario_id, cnh) VALUES ($1, '12345678901')`,
      [usrId], '23505');

    // ---- VEICULOS ----
    console.log('\n[ VEICULOS ]');
    const { rows: [{ id: veiId, status_aprovacao: sa }] } = await client.query(`
      INSERT INTO veiculos
        (marca, modelo, ano, placa, porte, classe, status_aprovacao, status, motorista_id)
      VALUES ('Toyota', 'Corolla', 2022, 'ABC9T99', 'SEDAN MEDIO', 'NORMAL', 'PENDENTE', 'INDISPONIVEL', $1)
      RETURNING id, status_aprovacao`, [usrId]);
    log('INSERT veiculos', !!veiId, veiId);
    log('statusAprovacao=PENDENTE', sa === 'PENDENTE');

    await testConstraintViolation(client, 'UNIQUE placa rejeita duplicata', `
      INSERT INTO veiculos (marca, modelo, ano, placa, porte, classe, status_aprovacao, status, motorista_id)
      VALUES ('Honda', 'Civic', 2023, 'ABC9T99', 'SEDAN MEDIO', 'NORMAL', 'PENDENTE', 'INDISPONIVEL', $1)`, [usrId]);

    await testConstraintViolation(client, 'CHECK classe rejeita valor inválido', `
      INSERT INTO veiculos (marca, modelo, ano, placa, porte, classe, status_aprovacao, status, motorista_id)
      VALUES ('X', 'Y', 2020, 'XYZ0000', 'HATCH', 'INVALIDA', 'PENDENTE', 'INDISPONIVEL', $1)`, [usrId], '23514');

    // ---- CORRIDAS ----
    console.log('\n[ CORRIDAS ]');
    const { rows: [{ id: oriId }] } = await client.query(`
      INSERT INTO enderecos (logradouro, cidade) VALUES ('Av. Origem', 'Vitória') RETURNING id`);
    const { rows: [{ id: dstId }] } = await client.query(`
      INSERT INTO enderecos (logradouro, cidade) VALUES ('Av. Destino', 'Vitória') RETURNING id`);
    const { rows: [{ id: corId, status: cs }] } = await client.query(`
      INSERT INTO corridas (usuario_id, origem_endereco_id, destino_endereco_id,
         origem_nome, destino_nome, distancia_km, valor, data_horario, status)
      VALUES ($1, $2, $3, 'Ponto A', 'Ponto B', 5.5, 0, NOW(), 'SOLICITADA')
      RETURNING id, status`, [usrId, oriId, dstId]);
    log('INSERT corridas', !!corId, corId);
    log('status=SOLICITADA', cs === 'SOLICITADA');

    await client.query("UPDATE corridas SET status='FINALIZADA' WHERE id=$1", [corId]);
    const { rows: [{ status: cs2 }] } = await client.query('SELECT status FROM corridas WHERE id=$1', [corId]);
    log('UPDATE status→FINALIZADA', cs2 === 'FINALIZADA');

    await testConstraintViolation(client, 'CHECK status corrida rejeita valor inválido',
      "UPDATE corridas SET status='INVALIDO' WHERE id=$1", [corId], '23514');

    await testConstraintViolation(client, 'CHECK distancia_km > 0 rejeita valor 0', `
      INSERT INTO corridas (usuario_id, origem_endereco_id, destino_endereco_id,
         origem_nome, destino_nome, distancia_km, valor, data_horario, status)
      VALUES ($1, $2, $3, 'A', 'B', 0, 0, NOW(), 'SOLICITADA')`, [usrId, oriId, dstId], '23514');

    // ---- CORRIDA_ROTAS ----
    console.log('\n[ CORRIDA_ROTAS ]');
    await client.query(`
      INSERT INTO corrida_rotas (corrida_id, ordem, distancia_km, distancia_metros, polyline, selecionada)
      VALUES ($1, 0, 5.5, 5500, 'encodedPolylineAqui', TRUE)`, [corId]);
    const { rows: rotas } = await client.query('SELECT * FROM corrida_rotas WHERE corrida_id=$1', [corId]);
    log('INSERT corrida_rotas', rotas.length === 1);
    log('selecionada=TRUE', rotas[0].selecionada === true);
    log('Relação FK corrida_rotas→corridas', rotas[0].corrida_id === corId);

    // ---- NOTIFICAÇÕES ----
    console.log('\n[ NOTIFICACOES ]');
    const adminId = '00000000-0000-0000-0000-000000000001';
    const { rows: [{ id: notId, lida }] } = await client.query(`
      INSERT INTO notificacoes (destinatario_id, tipo, titulo, mensagem)
      VALUES ($1, 'SOLICITACAO_MOTORISTA', 'Teste', 'Mensagem de teste')
      RETURNING id, lida`, [adminId]);
    log('INSERT notificacoes', !!notId, notId);
    log('lida=FALSE (padrão)', lida === false);

    await client.query('UPDATE notificacoes SET lida=TRUE WHERE id=$1', [notId]);
    const { rows: [{ lida: lida2 }] } = await client.query('SELECT lida FROM notificacoes WHERE id=$1', [notId]);
    log('UPDATE lida→TRUE', lida2 === true);

    await testConstraintViolation(client, 'CHECK tipo notificacao rejeita valor inválido', `
      INSERT INTO notificacoes (destinatario_id, tipo, titulo, mensagem)
      VALUES ($1, 'TIPO_INVALIDO', 'X', 'Y')`, [adminId], '23514');

    // ---- ADMIN EXISTE ----
    console.log('\n[ ADMIN ]');
    const { rows: adminRows } = await client.query(
      "SELECT id, usuario FROM usuarios WHERE id='00000000-0000-0000-0000-000000000001'"
    );
    log('Admin com UUID fixo existe', adminRows.length === 1, adminRows[0]?.usuario);

    // ---- ROLLBACK ----
    await client.query('ROLLBACK');
    console.log('\n[ROLLBACK] Dados de teste removidos — banco inalterado.\n');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n[ERRO INESPERADO]', err.message);
    fail++;
  } finally {
    client.release();
    const total = ok + fail;
    console.log(`=== RESULTADO: ${ok}/${total} testes OK ${fail > 0 ? `| ${fail} FALHOU` : '✓'} ===\n`);
    process.exit(fail === 0 ? 0 : 1);
  }
}

testar();
