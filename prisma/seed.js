const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const ADMIN_EMAIL = 'admin@admin.com'; // I will check if admin exists, or just query perfil = 'ADMINISTRADOR'
const SENHA_PADRAO = 'Teste@2026';

// Utils para login
function gerarLogin(nome, idx = '') {
  const partes = nome
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .trim()
    .split(' ')
    .filter((p) => p.length > 0);

  if (partes.length === 0) return `usuario${idx}`;
  const pNome = partes[0];
  const uNome = partes.length > 1 ? partes[partes.length - 1] : '';
  return `${pNome}${uNome}${idx}`;
}

async function limparDadosTeste(tx) {
  const emailsTeste = [];
  for (let i = 1; i <= 10; i++) emailsTeste.push(`passageiro${i.toString().padStart(2, '0')}@teste.com`);
  for (let i = 1; i <= 10; i++) emailsTeste.push(`motorista${i.toString().padStart(2, '0')}@teste.com`);

  const usuariosTeste = await tx.usuario.findMany({
    where: { email: { in: emailsTeste } },
    select: { id: true, enderecoId: true }
  });

  const idsUsuarios = usuariosTeste.map(u => u.id);
  const idsEnderecos = usuariosTeste.map(u => u.enderecoId).filter(id => id);

  if (idsUsuarios.length > 0) {
    // Notificacoes
    await tx.notificacao.deleteMany({ where: { destinatarioId: { in: idsUsuarios } } });
    
    // As rotas estão em Cascade com Corrida
    // Corridas
    await tx.corrida.deleteMany({ where: { usuarioId: { in: idsUsuarios } } });
    await tx.corrida.deleteMany({ where: { motoristaId: { in: idsUsuarios } } });
    
    // Veiculos
    const motoristas = await tx.motorista.findMany({ where: { usuarioId: { in: idsUsuarios } } });
    const idsMotoristas = motoristas.map(m => m.id); // Wait, motorista table only has id and usuarioId. The Veiculo table relates to Usuario for motorista!
    // Let's check Veiculo schema: motoristaId points to Usuario
    await tx.veiculo.deleteMany({ where: { motoristaId: { in: idsUsuarios } } });

    // Motoristas
    await tx.motorista.deleteMany({ where: { usuarioId: { in: idsUsuarios } } });

    // Usuarios
    await tx.usuario.deleteMany({ where: { id: { in: idsUsuarios } } });

    // Enderecos
    if (idsEnderecos.length > 0) {
      await tx.endereco.deleteMany({ where: { id: { in: idsEnderecos } } });
    }
  }
}

async function main() {
  console.log('Iniciando o Seed...');

  await prisma.$executeRawUnsafe('ALTER TABLE notificacoes DROP CONSTRAINT IF EXISTS ck_notificacoes_tipo;');

  await prisma.$transaction(async (tx) => {
    // 1. Limpar dados de teste anteriores para idempotência
    await limparDadosTeste(tx);

    // 2. Buscar admin
    const admin = await tx.usuario.findFirst({
      where: { perfil: 'ADMINISTRADOR' }
    });
    const adminId = admin ? admin.id : null;

    // 3. Criar passageiros (10)
    const passageiros = [];
    const nomesPassageiros = [
      'Ana Silva Oliveira', 'Carlos Eduardo Santos', 'Mariana Costa Mendes',
      'João Pedro Lima', 'Fernanda Souza Alves', 'Lucas Barbosa Ferreira',
      'Beatriz Rocha Dias', 'Rafael Ribeiro Carvalho', 'Juliana Castro Nogueira',
      'Thiago Martins Castro'
    ];
    const cidadesPassageiros = ['Vitória', 'Vila Velha', 'Serra', 'Cariacica', 'Viana', 'Guarapari', 'Linhares', 'Colatina', 'Aracruz', 'Cachoeiro de Itapemirim'];

    for (let i = 0; i < 10; i++) {
      const p = await tx.usuario.create({
        data: {
          nome: nomesPassageiros[i],
          cpf: `111111111${i.toString().padStart(2, '0')}`,
          celular: `279999911${i.toString().padStart(2, '0')}`,
          email: `passageiro${(i+1).toString().padStart(2, '0')}@teste.com`,
          usuario: gerarLogin(nomesPassageiros[i], '1'),
          senha: SENHA_PADRAO,
          perfil: 'USUARIO',
          endereco: {
            create: {
              logradouro: `Rua Teste ${i}`,
              numero: '123',
              bairro: 'Centro',
              cidade: cidadesPassageiros[i],
              estado: 'Espírito Santo',
              uf: 'ES',
              cep: '29000000',
              latitude: -20.3155,
              longitude: -40.3128
            }
          }
        }
      });
      passageiros.push(p);
    }

    // 4. Criar motoristas (10: 5 PENDENTES, 5 APROVADOS)
    const motoristasUsers = [];
    const motoristasEntity = [];
    const nomesMotoristas = [
      'Marcos Paulo Silva', 'Camila Rodrigues Mendes', 'Felipe Nunes Costa',
      'Amanda Teixeira Lima', 'Bruno Moreira Santos', 'Paula Gomes Ferreira',
      'Rodrigo Araujo Dias', 'Tatiana Cardoso Ribeiro', 'Eduardo Neves Nogueira',
      'Larissa Ramos Castro'
    ];
    
    for (let i = 0; i < 10; i++) {
      const m = await tx.usuario.create({
        data: {
          nome: nomesMotoristas[i],
          cpf: `222222222${i.toString().padStart(2, '0')}`,
          celular: `279999922${i.toString().padStart(2, '0')}`,
          email: `motorista${(i+1).toString().padStart(2, '0')}@teste.com`,
          usuario: gerarLogin(nomesMotoristas[i], '2'),
          senha: SENHA_PADRAO,
          perfil: 'MOTORISTA',
          endereco: {
            create: {
              logradouro: `Avenida Motorista ${i}`,
              numero: '456',
              bairro: 'Bairro',
              cidade: cidadesPassageiros[i],
              estado: 'Espírito Santo',
              uf: 'ES',
              cep: '29000000',
              latitude: -20.3155,
              longitude: -40.3128
            }
          }
        }
      });
      motoristasUsers.push(m);

      const statusCad = i < 5 ? 'PENDENTE' : 'APROVADO';
      const statusPres = statusCad === 'APROVADO' ? 'ONLINE' : 'OFFLINE';
      
      const motoristaE = await tx.motorista.create({
        data: {
          usuarioId: m.id,
          cnh: `123456789${i.toString().padStart(2, '0')}`,
          statusCadastro: statusCad,
          statusPresenca: statusPres
        }
      });
      motoristasEntity.push(motoristaE);

      if (adminId && statusCad === 'PENDENTE') {
        await tx.notificacao.create({
          data: {
            destinatarioId: adminId,
            tipo: 'SOLICITACAO_MOTORISTA',
            titulo: 'Novo motorista para análise',
            mensagem: `O motorista ${m.nome} solicitou cadastro.`,
            referenciaId: m.id,
            lida: i % 2 === 0
          }
        });
      }

      if (statusCad === 'APROVADO') {
        await tx.notificacao.create({
          data: {
            destinatarioId: m.id,
            tipo: 'CADASTRO_APROVADO',
            titulo: 'Cadastro Aprovado',
            mensagem: 'Seu cadastro como motorista foi aprovado!',
            referenciaId: m.id,
            lida: false
          }
        });
      }
    }

    // 5. Criar veículos para os motoristas aprovados (5) e talvez pendentes
    // A regra costuma ser que motorista pode cadastrar veículo e ele tb passa por aprovação
    const classes = ['BASICO', 'NORMAL', 'PREMIUM'];
    const portes = ['Pequeno', 'Medio', 'Grande'];
    const veiculos = [];

    for (let i = 0; i < 10; i++) {
      const idx = i % 3;
      const statusAprov = motoristasEntity[i].statusCadastro === 'APROVADO' ? 'APROVADO' : 'PENDENTE';
      const statusDisp = statusAprov === 'APROVADO' ? 'DISPONIVEL' : 'INDISPONIVEL';

      const v = await tx.veiculo.create({
        data: {
          motoristaId: motoristasUsers[i].id,
          marca: 'MarcaTeste',
          modelo: 'ModeloTeste',
          ano: 2020 + (i % 4),
          placa: `ABC1D${i.toString().padStart(2, '0')}`,
          cor: 'Prata',
          porte: portes[idx],
          classe: classes[idx],
          statusAprovacao: statusAprov,
          status: statusDisp,
          documentacaoRegularizada: true
        }
      });
      veiculos.push(v);
    }

    // 6. Criar 10 Corridas
    // Vamos distribuir entre os 10 passageiros
    // E distribuir entre os 5 motoristas aprovados
    const statusCorridas = ['SOLICITADA', 'CONFIRMADA', 'EM_ANDAMENTO', 'FINALIZADA', 'CANCELADA'];
    const formasPgto = ['DINHEIRO', 'CARTAO_CREDITO', 'PIX'];
    
    // Horarios para teste: Manha (08:00), Tarde (15:00), Noite (22:00)
    const horarios = [
      new Date('2026-10-01T08:00:00Z'),
      new Date('2026-10-01T15:00:00Z'),
      new Date('2026-10-01T22:00:00Z')
    ];

    const distancias = [5.8, 8.4, 12.7, 16.2, 21.5, 28.1, 32.4, 6.9, 14.3, 24.6];

    for (let i = 0; i < 10; i++) {
      const passageiro = passageiros[i];
      const veiculo = veiculos[i % 5 + 5]; // Motoristas 5 a 9 sao os aprovados
      const motoristaUser = motoristasUsers[i % 5 + 5];
      
      const st = statusCorridas[i % 5];
      const dist = distancias[i];
      
      const tarifaBase = {
        'BASICO':  [1.50, 2.00, 2.50],
        'NORMAL':  [2.00, 2.50, 3.00],
        'PREMIUM': [2.50, 3.00, 3.50]
      };

      const horaIdx = i % 3;
      const t = tarifaBase[veiculo.classe][horaIdx];
      const valor = parseFloat((dist * t).toFixed(2));

      // Endereços da corrida
      const origemE = await tx.endereco.create({
        data: {
          logradouro: `Origem ${i}`, cidade: cidadesPassageiros[i], estado: 'Espírito Santo', latitude: -20.31, longitude: -40.31
        }
      });
      const destinoE = await tx.endereco.create({
        data: {
          logradouro: `Destino ${i}`, cidade: cidadesPassageiros[(i+1)%10], estado: 'Espírito Santo', latitude: -20.32, longitude: -40.32
        }
      });

      const c = await tx.corrida.create({
        data: {
          usuarioId: passageiro.id,
          motoristaId: (st !== 'SOLICITADA' && st !== 'CANCELADA') ? motoristaUser.id : null,
          veiculoId: (st !== 'SOLICITADA' && st !== 'CANCELADA') ? veiculo.id : null,
          origemEnderecoId: origemE.id,
          destinoEnderecoId: destinoE.id,
          origemNome: `Rua Origem ${i}`,
          destinoNome: `Rua Destino ${i}`,
          distanciaKm: dist,
          duracaoMin: Math.floor(dist * 2), // aprox
          valor: valor,
          dataHorario: horarios[horaIdx],
          status: st,
          classe: veiculo.classe,
          formaPagamento: formasPgto[i % 3]
        }
      });

      if (st === 'CONFIRMADA' || st === 'EM_ANDAMENTO') {
        await tx.notificacao.create({
          data: {
            destinatarioId: motoristaUser.id,
            tipo: 'NOVA_CORRIDA',
            titulo: 'Nova Corrida Atribuída',
            mensagem: 'Você tem uma nova corrida confirmada!',
            referenciaId: c.id,
            lida: false
          }
        });
      }
    }

    console.log('Seed executado com sucesso!');
  }, { maxWait: 15000, timeout: 120000 });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
