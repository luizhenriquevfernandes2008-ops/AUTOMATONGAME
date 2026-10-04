// Dados do jogo (3.0): itens, receitas, máquinas, marcos, pesquisas, fases do foguete e objetivos.

export const CELL = 1.5; // tamanho de um quadradinho do grid em metros
export const GRID_MIN = -24, GRID_MAX = 23; // área inicial construível (em células)
export const WORLD_MIN = -335, WORLD_MAX = 334; // mapa inteiro em células (o planeta vai de -512 a 512 m)

// ─── Itens ───
// pilha: quantos cabem num espaço do inventário · cat: categoria (pra organizar as telas)
export const ITEMS = {
  // brutos: minério (veios) e coleta (plantas)
  minerio_ferro: { nome: 'Minério de Ferro', cor: '#8fa3c0', pilha: 100, cat: 'bruto' },
  minerio_cobre: { nome: 'Minério de Cobre', cor: '#d9824a', pilha: 100, cat: 'bruto' },
  calcario: { nome: 'Calcário', cor: '#d8d2bc', pilha: 100, cat: 'bruto' },
  carvao: { nome: 'Carvão', cor: '#3a3a44', pilha: 100, cat: 'bruto' },
  quartzo: { nome: 'Quartzo', cor: '#f1c9ff', pilha: 100, cat: 'bruto' },
  cristal_kx: { nome: 'Cristal KX', cor: '#b98aff', pilha: 50, cat: 'bruto' },
  luminita: { nome: 'Luminita', cor: '#6dffb0', pilha: 50, cat: 'bruto' },
  fragmento_estelar: { nome: 'Fragmento Estelar', cor: '#b18cff', pilha: 50, cat: 'bruto' },
  madeira: { nome: 'Madeira', cor: '#b07a4a', pilha: 200, cat: 'coleta', material: true },
  folhas: { nome: 'Folhas', cor: '#5fae6a', pilha: 500, cat: 'coleta' },
  fibra: { nome: 'Fibra', cor: '#c8b070', pilha: 500, cat: 'coleta' },
  esporos: { nome: 'Esporos', cor: '#7dffb0', pilha: 500, cat: 'coleta' },
  // combustível e lingotes
  biomassa: { nome: 'Biomassa', cor: '#6a8a3a', pilha: 200, cat: 'combustivel' },
  lingote_ferro: { nome: 'Lingote de Ferro', cor: '#cfd6e2', pilha: 100, cat: 'lingote' },
  lingote_cobre: { nome: 'Lingote de Cobre', cor: '#e8894f', pilha: 100, cat: 'lingote' },
  silicio: { nome: 'Silício', cor: '#5767a8', pilha: 100, cat: 'lingote' },
  aco: { nome: 'Aço', cor: '#8d9ab0', pilha: 100, cat: 'lingote', material: true },
  vidro: { nome: 'Vidro', cor: '#9fd8ff', pilha: 100, cat: 'lingote', material: true },
  // peças (Construtora ou Bancada)
  placa_ferro: { nome: 'Placa de Ferro', cor: '#b8c2d0', pilha: 200, cat: 'peca' },
  haste_ferro: { nome: 'Haste de Ferro', cor: '#9aa6b8', pilha: 200, cat: 'peca' },
  parafuso: { nome: 'Parafuso', cor: '#c8ccd4', pilha: 500, cat: 'peca' },
  fio: { nome: 'Fio de Cobre', cor: '#f09a5a', pilha: 500, cat: 'peca' },
  cabo: { nome: 'Cabo', cor: '#4a505c', pilha: 200, cat: 'peca' },
  chapa_cobre: { nome: 'Chapa de Cobre', cor: '#e07a40', pilha: 200, cat: 'peca' },
  concreto: { nome: 'Concreto', cor: '#9a9ea6', pilha: 500, cat: 'peca', material: true },
  tijolo: { nome: 'Tijolo', cor: '#c0643c', pilha: 200, cat: 'peca', material: true },
  engrenagem: { nome: 'Engrenagem', cor: '#9aa3c9', pilha: 200, cat: 'peca' },
  viga_aco: { nome: 'Viga de Aço', cor: '#6f7d96', pilha: 200, cat: 'peca' },
  tubo_aco: { nome: 'Tubo de Aço', cor: '#7f8ca4', pilha: 200, cat: 'peca' },
  // montados (Montadora; os primeiros também na Bancada)
  placa_reforcada: { nome: 'Placa Reforçada', cor: '#7f8a9a', pilha: 100, cat: 'montado' },
  rotor: { nome: 'Rotor', cor: '#a9b4c4', pilha: 100, cat: 'montado' },
  estrutura_modular: { nome: 'Estrutura Modular', cor: '#8a94a6', pilha: 50, cat: 'montado' },
  estator: { nome: 'Estator', cor: '#c88a5a', pilha: 100, cat: 'montado' },
  motor: { nome: 'Motor', cor: '#7c86b8', pilha: 50, cat: 'montado' },
  chip: { nome: 'Chip', cor: '#3fbf7f', pilha: 100, cat: 'montado' },
  oscilador: { nome: 'Oscilador de Cristal', cor: '#c89aff', pilha: 50, cat: 'montado' },
  processador: { nome: 'Processador', cor: '#2f6fd6', pilha: 50, cat: 'montado' },
  bateria: { nome: 'Bateria', cor: '#5dd39e', pilha: 50, cat: 'montado' },
  painel_led: { nome: 'Painel de LED', cor: '#ff6ec7', pilha: 50, cat: 'montado' },
  robozinho: { nome: 'Robozinho', cor: '#e9f0ff', pilha: 20, cat: 'montado' },
  computador_quantico: { nome: 'Computador Quântico', cor: '#6cf5ff', pilha: 10, cat: 'montado' },
  modulo_foguete: { nome: 'Módulo de Foguete', cor: '#f0f0f5', pilha: 10, cat: 'montado' },
  satelite: { nome: 'Satélite', cor: '#ffd35a', pilha: 10, cat: 'montado' },
  // escondidos (horta e sistemas antigos): ficam aqui pro código antigo não quebrar
  escoria: { nome: 'Escória', cor: '#7a6a5a', pilha: 100, oculto: true },
  grao_cafe: { nome: 'Grão de Café', cor: '#6b3a22', horta: true, oculto: true },
  melancia: { nome: 'Melancia', cor: '#3f9a4a', horta: true, oculto: true },
  abobora: { nome: 'Abóbora', cor: '#f08a2a', horta: true, oculto: true },
  milho: { nome: 'Milho', cor: '#f2d04a', horta: true, oculto: true },
  cenoura: { nome: 'Cenoura', cor: '#f0782a', horta: true, oculto: true },
};
for (const it of Object.values(ITEMS)) { it.pilha = it.pilha || 100; it.base = it.base || 1; }

// Minérios que existem no mapa (tempo: segundos por minério no Minerador Mk1 num veio normal = 60/min)
export const ORES = {
  ferro: { item: 'minerio_ferro', nome: 'Ferro', cor: 0x9fb4d6, tempo: 1 },
  cobre: { item: 'minerio_cobre', nome: 'Cobre', cor: 0xe8844a, tempo: 1 },
  calcario: { item: 'calcario', nome: 'Calcário', cor: 0xe2dccb, tempo: 1 },
  carvao: { item: 'carvao', nome: 'Carvão', cor: 0x2e2e38, tempo: 1 },
  quartzo: { item: 'quartzo', nome: 'Quartzo', cor: 0xf3c4ff, tempo: 1.2 },
  cristal: { item: 'cristal_kx', nome: 'Cristal KX', cor: 0xb07cff, tempo: 1.5 },
  luminita: { item: 'luminita', nome: 'Luminita', cor: 0x5dffa8, tempo: 1.5 },
  estelar: { item: 'fragmento_estelar', nome: 'Meteorito', cor: 0xb18cff, tempo: 3, raro: true },
};

// Fornalha (1 ou 2 entradas). u = marco/pesquisa que libera · alt = receita alternativa (💾 disco)
export const SMELT = {
  lingote_ferro: { in: { minerio_ferro: 1 }, out: 'lingote_ferro', tempo: 2 },
  lingote_cobre: { in: { minerio_cobre: 1 }, out: 'lingote_cobre', tempo: 2 },
  aco: { in: { lingote_ferro: 1, carvao: 1 }, out: 'aco', tempo: 4, u: 't2_1' },
  silicio: { in: { quartzo: 2 }, out: 'silicio', tempo: 4, u: 't3_1' },
  vidro: { in: { quartzo: 3 }, out: 'vidro', tempo: 4, u: 't3_1' },
  aco_direto: { in: { minerio_ferro: 2, carvao: 1 }, out: 'aco', qtd: 1, tempo: 4, alt: true },
  silicio_puro: { in: { quartzo: 1, carvao: 1 }, out: 'silicio', tempo: 4, alt: true },
  vidro_cristal: { in: { quartzo: 1, cristal_kx: 1 }, out: 'vidro', qtd: 3, tempo: 4, alt: true },
};

// Construtora (1 entrada). mao = segundos por unidade na Bancada (sem "mao" = só na máquina)
export const CONSTRUCT = {
  placa_ferro: { in: { lingote_ferro: 3 }, qtd: 2, tempo: 6, mao: 1.2 },
  haste_ferro: { in: { lingote_ferro: 1 }, qtd: 1, tempo: 4, mao: 0.8 },
  parafuso: { in: { haste_ferro: 1 }, qtd: 4, tempo: 6, mao: 0.8 },
  fio: { in: { lingote_cobre: 1 }, qtd: 2, tempo: 4, mao: 0.6 },
  cabo: { in: { fio: 2 }, qtd: 1, tempo: 2, mao: 0.8 },
  concreto: { in: { calcario: 3 }, qtd: 1, tempo: 4, mao: 1 },
  biomassa: { in: { folhas: 6 }, qtd: 3, tempo: 4, mao: 0.5 },
  biomassa_madeira: { in: { madeira: 2 }, out: 'biomassa', qtd: 5, tempo: 4, mao: 0.8 },
  biomassa_fibra: { in: { fibra: 5 }, out: 'biomassa', qtd: 2, tempo: 4, mao: 0.5 },
  biomassa_esporos: { in: { esporos: 3 }, out: 'biomassa', qtd: 3, tempo: 4, mao: 0.5 },
  chapa_cobre: { in: { lingote_cobre: 2 }, qtd: 1, tempo: 6, mao: 1.5, u: 'm0_3' },
  tijolo: { in: { calcario: 2 }, qtd: 1, tempo: 3, mao: 1, u: 'm0_3' },
  engrenagem: { in: { haste_ferro: 2 }, qtd: 1, tempo: 4, mao: 1, u: 'm0_3' },
  viga_aco: { in: { aco: 4 }, qtd: 1, tempo: 4, u: 't2_1' },
  tubo_aco: { in: { aco: 3 }, qtd: 2, tempo: 6, u: 't2_1' },
  haste_aco: { in: { aco: 1 }, out: 'haste_ferro', qtd: 4, tempo: 5, alt: true },
  fio_ferro: { in: { lingote_ferro: 5 }, out: 'fio', qtd: 9, tempo: 24, alt: true },
};

// Montadora (2 entradas)
export const RECIPES = {
  placa_reforcada: { in: { placa_ferro: 6, parafuso: 12 }, qtd: 1, tempo: 12, mao: 3 },
  rotor: { in: { haste_ferro: 5, parafuso: 25 }, qtd: 1, tempo: 15, mao: 3 },
  estrutura_modular: { in: { placa_reforcada: 3, haste_ferro: 12 }, qtd: 2, tempo: 30, u: 't1_2' },
  estator: { in: { tubo_aco: 3, fio: 8 }, qtd: 1, tempo: 12, u: 't2_2' },
  motor: { in: { rotor: 2, estator: 2 }, qtd: 1, tempo: 12, u: 't2_2' },
  chip: { in: { silicio: 2, cabo: 2 }, qtd: 1, tempo: 8, u: 't3_1' },
  oscilador: { in: { cristal_kx: 4, cabo: 6 }, qtd: 1, tempo: 16, u: 't4_1' },
  processador: { in: { chip: 2, oscilador: 1 }, qtd: 1, tempo: 16, u: 't4_1' },
  bateria: { in: { luminita: 2, chapa_cobre: 2 }, qtd: 1, tempo: 10, u: 't4_2' },
  painel_led: { in: { vidro: 2, luminita: 1 }, qtd: 1, tempo: 8, u: 't4_2' },
  robozinho: { in: { motor: 1, processador: 1 }, qtd: 1, tempo: 20, u: 't5_1' },
  computador_quantico: { in: { processador: 2, fragmento_estelar: 2 }, qtd: 1, tempo: 30, u: 't5_1' },
  modulo_foguete: { in: { estrutura_modular: 4, motor: 2 }, qtd: 1, tempo: 30, u: 't5_1' },
  satelite: { in: { computador_quantico: 1, painel_led: 4 }, qtd: 1, tempo: 40, u: 't5_2' },
  // alternativas (💾 discos)
  placa_aparafusada: { in: { placa_ferro: 18, parafuso: 50 }, out: 'placa_reforcada', qtd: 3, tempo: 12, alt: true },
  rotor_aco: { in: { tubo_aco: 2, fio: 6 }, out: 'rotor', qtd: 1, tempo: 15, alt: true },
  chip_cristal: { in: { cristal_kx: 1, fio: 6 }, out: 'chip', qtd: 1, tempo: 10, alt: true },
  motor_compacto: { in: { rotor: 1, chip: 1 }, out: 'motor', qtd: 1, tempo: 12, alt: true },
  concreto_armado: { in: { calcario: 4, haste_ferro: 1 }, out: 'concreto', qtd: 3, tempo: 6, alt: true },
  estrutura_aparafusada: { in: { placa_ferro: 10, parafuso: 40 }, out: 'estrutura_modular', qtd: 1, tempo: 24, alt: true },
};
// item que uma receita (de qualquer máquina) produz
export const recipeOut = (k, r) => r.out || k;
// receitas que dá pra fazer na mão (Bancada)
export const HAND = Object.fromEntries([...Object.entries(CONSTRUCT), ...Object.entries(RECIPES)].filter(([, r]) => r.mao));
// combustível dos geradores (segundos que cada item queima)
export const FUELS = {
  gerador: { biomassa: 6, madeira: 8, esporos: 3, folhas: 1.2, fibra: 1.2 },
  gerador_carvao: { carvao: 8 },
};

// ─── Horta ───
// tempo = segundos pra ficar pronta (com água e de dia). colheita = itens por colheita. estagios = modelos 3D de cada fase
export const CROPS = {
  cafe: { nome: 'Café', icone: '☕', item: 'grao_cafe', qtd: 3, tempo: 150, semente: 4, estagios: ['c_leafsA', 'c_leafsB', 'c_bush'] },
  milho: { nome: 'Milho', icone: '🌽', item: 'milho', qtd: 3, tempo: 110, semente: 2, estagios: ['c_cornA', 'c_cornB', 'c_cornC', 'c_cornD'] },
  cenoura: { nome: 'Cenoura', icone: '🥕', item: 'cenoura', qtd: 3, tempo: 80, semente: 1, estagios: ['c_leafsA', 'c_carrot'] },
  abobora: { nome: 'Abóbora', icone: '🎃', item: 'abobora', qtd: 1, tempo: 170, semente: 5, estagios: ['c_leafsA', 'c_leafsB', 'c_pumpkin'] },
  melancia: { nome: 'Melancia', icone: '🍉', item: 'melancia', qtd: 1, tempo: 200, semente: 6, estagios: ['c_leafsA', 'c_leafsB', 'c_melon'] },
  bambu: { nome: 'Bambu', icone: '🎋', item: 'madeira', qtd: 3, tempo: 120, semente: 2, estagios: ['c_bambooA', 'c_bambooB'] },
};

// ─── Construção: paredes, pisos e tetos ───
// custo = quantos itens do material cada peça gasta. borda = fica na borda entre duas células
export const PIECES = {
  fundacao: { nome: 'Fundação', icone: '🟫', model: null, custo: 2, fixo: 'concreto', fundacao: true },
  parede: { nome: 'Parede', icone: '🧱', model: 's_wall', custo: 4, borda: true },
  janela: { nome: 'Janela', icone: '🪟', model: 's_window', custo: 3, vidro: 2, borda: true },
  porta: { nome: 'Porta', icone: '🚪', model: 's_door', custo: 3, borda: true, passa: true },
  piso: { nome: 'Piso', icone: '⬛', model: 's_floor', custo: 2 },
  teto: { nome: 'Teto', icone: '🏠', model: 's_floor', custo: 2, alto: true },
  cerca: { nome: 'Cerca', icone: '🪵', model: 's_fence', custo: 1, borda: true, fixo: 'madeira' },
};
// materiais: item gasto, cor e acabamento
export const MATERIALS = {
  madeira: { nome: 'Madeira', item: 'madeira', cor: 0xb98352, rough: 0.8 },
  tijolo: { nome: 'Tijolo', item: 'tijolo', cor: 0xb85a3e, rough: 0.95 },
  concreto: { nome: 'Concreto', item: 'concreto', cor: 0xa3a7ae, rough: 0.95 },
  vidro: { nome: 'Vidro', item: 'vidro', cor: 0xa8dcff, rough: 0.1, vidro: true },
  aco: { nome: 'Aço', item: 'aco', cor: 0x7f8b9c, rough: 0.35, metal: 0.6 },
};
export const PAINTS = [
  { nome: 'Sem tinta', cor: null }, { nome: 'Branco', cor: 0xf2eee6 }, { nome: 'Creme', cor: 0xf3dfb0 }, { nome: 'Terracota', cor: 0xd0714a },
  { nome: 'Verde-sálvia', cor: 0x9bb88f }, { nome: 'Azul-céu', cor: 0x8fb8e0 }, { nome: 'Lavanda', cor: 0xb8a4de }, { nome: 'Rosa', cor: 0xe8a4b8 },
  { nome: 'Amarelo', cor: 0xf2c94c }, { nome: 'Grafite', cor: 0x4a4e5a },
];
export const PAINT_PRICE = 2;
// preço de 1 material na loja (mais caro que fabricar)
export const MATERIAL_SHOP = { madeira: 8, tijolo: 12, concreto: 18, vidro: 24, aco: 45 };

// quadros de domínio público (Wikimedia Commons)
export const PAINTINGS = {
  q_noite: { nome: 'A Noite Estrelada', autor: 'Vincent van Gogh, 1889', img: 'vangogh_noite', w: 512, h: 405, preco: 120 },
  q_onda: { nome: 'A Grande Onda', autor: 'Katsushika Hokusai, c. 1831', img: 'hokusai_onda', w: 512, h: 344, preco: 120 },
  q_impressao: { nome: 'Impressão, Nascer do Sol', autor: 'Claude Monet, 1872', img: 'monet_impressao', w: 512, h: 398, preco: 120 },
  q_girassois: { nome: 'Girassóis', autor: 'Vincent van Gogh, 1889', img: 'vangogh_girassois', w: 512, h: 671, preco: 150 },
  q_perola: { nome: 'Moça com Brinco de Pérola', autor: 'Johannes Vermeer, c. 1665', img: 'vermeer_perola', w: 512, h: 606, preco: 150 },
  q_caipira: { nome: 'Caipira Picando Fumo', autor: 'Almeida Júnior, 1893', img: 'almeida_caipira', w: 512, h: 729, preco: 180 },
  q_fuji: { nome: 'Fuji Vermelho', autor: 'Katsushika Hokusai, c. 1831', img: 'hokusai_fuji', w: 512, h: 342, preco: 150 },
};

// melhorias de hardware de cada computador (compradas no ⚙ Hardware do editor)
export const PC_UPGRADES = {
  clock: { nome: 'Overclock', icone: '⏩', desc: 'Multiplica as instruções por segundo deste computador.', valores: [1, 1.5, 2, 3], custos: [{ placa_reforcada: 2, cabo: 20 }, { rotor: 4, fio: 60 }, { chip: 4, motor: 2 }], precos: [0, 0, 0], niveis: [0, 0, 0], energia: [0, 1, 2, 4], unidade: '×' },
  memoria: { nome: 'Memória', icone: '🧠', desc: 'Quantas variáveis e itens por lista o programa pode guardar.', valores: [24, 48, 96, Infinity], lista: [256, 1024, 4096, Infinity], custos: [{ fio: 40, cabo: 10 }, { placa_reforcada: 4, cabo: 30 }, { chip: 6, cabo: 40 }], precos: [0, 0, 0], niveis: [0, 0, 0], energia: [0, 0, 1, 2] },
};

// Máquinas e construções. custo = itens pra construir (volta tudo quando desmonta)
// u = marco ou pesquisa que libera · cat = aba do menu de construção · tamanho = células de lado (3 = 3×3)
// energia: ⚡ que consome · gera: ⚡ que produz
export const MACHINES = {
  // especiais
  central: {
    nome: 'Central (HUB)', custo: { placa_ferro: 10, haste_ferro: 10 }, cat: 'especial', unico: true, tamanho: 3, prefixo: 'central', model: 'hub3',
    desc: 'O coração da base: os Marcos (tiers), a Bancada pra fabricar na mão e um armazém. Monte perto da cápsula.', solido: true,
  },
  bancada: {
    nome: 'Bancada', custo: { placa_ferro: 4, haste_ferro: 4 }, u: 'm0_1', cat: 'especial', prefixo: 'bancada', tamanho: 3, model: 'workbench3',
    desc: 'Fabrique peças na mão (segure o botão) em qualquer lugar da fábrica.', solido: true,
  },
  plataforma: {
    nome: 'Plataforma de Lançamento', custo: { concreto: 100, placa_reforcada: 20, viga_aco: 20 }, u: 't2_3', cat: 'especial', unico: true, tamanho: 3, prefixo: 'plataforma', model: 'launchPad',
    desc: 'Projeto Foguete: entregue as peças de cada fase por esteira. Cada fase libera um tier novo.', solido: true,
  },
  // produção
  minerador: {
    nome: 'Minerador', custo: { placa_ferro: 10, concreto: 10 }, cat: 'producao', prefixo: 'minerador', tamanho: 3, model: 'miner3', energia: 5,
    desc: 'Ocupa 3×3 e fica centralizado em cima de um veio; minera sozinho quando ligado (60/min num veio normal; ½× impuro, 2× puro). O minério sai pela seta laranja.', solido: true,
  },
  fornalha: {
    nome: 'Fornalha', custo: { haste_ferro: 5, fio: 8 }, u: 'm0_1', cat: 'producao', prefixo: 'fornalha', tamanho: 3, model: 'smelter3', energia: 4,
    desc: 'Derrete minério em lingote (30/min). Escolha a receita e ligue. Entrada pelas setas azuis, saída pela laranja.', solido: true,
  },
  construtora: {
    nome: 'Construtora', custo: { placa_ferro: 8, haste_ferro: 8, cabo: 6 }, u: 'm0_3', cat: 'producao', prefixo: 'construtora', tamanho: 3, model: 'constructor3', energia: 4,
    desc: 'Transforma 1 tipo de item em peças: placas, hastes, parafusos, fios, cabos, concreto, biomassa…', solido: true,
  },
  montadora: {
    nome: 'Montadora', custo: { placa_reforcada: 6, rotor: 4, cabo: 10 }, u: 't1_1', cat: 'producao', prefixo: 'montadora', tamanho: 3, model: 'assembler3', energia: 15,
    desc: 'Junta 2 tipos de item: placa reforçada, rotor, motor, chip, processador…', solido: true,
  },
  bancada_dummy: null,
  // logística
  esteira: { nome: 'Esteira Mk1', custo: { placa_ferro: 1 }, u: 'm0_1', cat: 'logistica', prefixo: 'esteira', model: 'belt', desc: '60 itens por minuto. Leva itens na direção das setinhas (sobe e desce morro).', solido: false },
  esteira_rapida: { nome: 'Esteira Mk2', custo: { placa_ferro: 2, parafuso: 4 }, u: 't1_1', cat: 'logistica', prefixo: 'esteira', model: 'belt', desc: '120 itens por minuto. Coloque por cima de outra esteira pra trocar.', solido: false },
  esteira_expressa: { nome: 'Esteira Mk3', custo: { viga_aco: 1, parafuso: 6 }, u: 't2_3', cat: 'logistica', prefixo: 'esteira', model: 'belt', desc: '270 itens por minuto.', solido: false },
  esteira_mk4: { nome: 'Esteira Mk4', custo: { tubo_aco: 1, cabo: 1 }, u: 't3_3', cat: 'logistica', prefixo: 'esteira', model: 'belt', desc: '480 itens por minuto.', solido: false },
  esteira_mk5: { nome: 'Esteira Mk5', custo: { tubo_aco: 2, chapa_cobre: 1 }, u: 't4_3', cat: 'logistica', prefixo: 'esteira', model: 'belt', desc: '780 itens por minuto.', solido: false },
  divisor: { nome: 'Divisor', custo: { placa_ferro: 2, cabo: 2 }, u: 'm0_2', cat: 'logistica', prefixo: 'divisor', model: 'splitter3', desc: 'Entra por trás e reparte os itens entre frente, esquerda e direita, um pra cada lado.', solido: false },
  juntador: { nome: 'Juntador', custo: { placa_ferro: 2, haste_ferro: 2 }, u: 'm0_2', cat: 'logistica', prefixo: 'juntador', model: 'merger3', desc: 'Junta até 3 esteiras (trás, esquerda, direita) numa só, sem engarrafar um lado. Ótimo pra misturar minérios.', solido: false },
  separador: { nome: 'Separador Inteligente', custo: { placa_reforcada: 2, cabo: 10 }, u: 'm0_5', cat: 'logistica', prefixo: 'separador', model: 'sorter3', energia: 1, desc: 'Manda cada item pra esquerda, direita ou frente. Configure os filtros (E) ou programe com .enviar().', solido: true },
  esteira_alta: { nome: 'Esteira Elevada', custo: { placa_ferro: 2, haste_ferro: 3 }, u: 't1_2', cat: 'logistica', prefixo: 'alta', model: 'beltHigh', desc: 'Esteira no 2º andar: passa por cima de outras esteiras e máquinas baixas. Use rampas pra subir e descer.', solido: false },
  rampa_sobe: { nome: 'Rampa (sobe)', custo: { placa_ferro: 2, haste_ferro: 4 }, u: 't1_2', cat: 'logistica', prefixo: 'rampa', model: 'rampUp', desc: 'Recebe do chão (por trás) e leva o item pra Esteira Elevada na frente.', solido: false },
  rampa_desce: { nome: 'Rampa (desce)', custo: { placa_ferro: 2, haste_ferro: 4 }, u: 't1_2', cat: 'logistica', prefixo: 'rampa', model: 'rampDown', desc: 'Recebe da Esteira Elevada (por trás) e desce o item pro chão na frente.', solido: false },
  sensor: { nome: 'Esteira com Sensor', custo: { placa_ferro: 1, cabo: 2 }, u: 't1_3', cat: 'logistica', prefixo: 'sensor', model: 'belt', energia: 1, desc: 'Esteira que conta e avisa cada item que passa. Use .esperar_item() ou ouvir("sensor1").', solido: false },
  bau: { nome: 'Contêiner', custo: { placa_ferro: 6, haste_ferro: 6 }, u: null, cat: 'logistica', prefixo: 'bau', tamanho: 3, model: 'container3', desc: 'Guarda até 24 pilhas de itens. Recebe por esteira; E pra pegar e guardar. .retirar() solta pela seta laranja.', solido: true },
  lixeira: { nome: 'Lixeira', custo: { placa_ferro: 4, concreto: 2 }, u: 't1_3', cat: 'logistica', prefixo: 'lixeira', model: 'trash', desc: 'Destrói qualquer item que chegar.', solido: true },
  braco: { nome: 'Braço Robótico', custo: { placa_ferro: 4, rotor: 1, cabo: 4 }, u: 't2_2', cat: 'logistica', prefixo: 'braco', model: 'robotArm', energia: 2, desc: 'Pega itens de trás e solta na frente. Liga com botão ou programa com .mover().', solido: true },
  doca_drones: { nome: 'Doca de Drones', custo: { estrutura_modular: 2, motor: 2, oscilador: 2 }, u: 't4_3', cat: 'logistica', prefixo: 'doca', model: 'hangar', energia: 8, desc: 'Cria um drone programável que voa e carrega itens: .ir_para("bau1"), .pegar(), .soltar().', solido: true },
  // energia
  gerador: { nome: 'Gerador de Biomassa', custo: { placa_ferro: 10, cabo: 10 }, cat: 'energia', prefixo: 'gerador', tamanho: 3, model: 'burner3', gera: 30, combustivel: true, desc: 'Produz 30 ⚡ queimando biomassa, madeira, esporos ou folhas. Coloque combustível (E) ou mande por esteira.', solido: true },
  poste: { nome: 'Poste de Energia', custo: { haste_ferro: 1, cabo: 1, concreto: 1 }, u: null, cat: 'energia', prefixo: 'poste', model: 'pylon3', desc: 'Leva a energia mais longe. Aceita até 6 cabos.', solido: false },
  gerador_carvao: { nome: 'Gerador a Carvão', custo: { placa_reforcada: 10, rotor: 5, cabo: 20 }, u: 't1_4', cat: 'energia', prefixo: 'geradorC', tamanho: 3, model: 'coalgen3', gera: 75, combustivel: true, desc: 'Produz 75 ⚡ queimando carvão (1 a cada 8 s). Carvão entra pelas setas azuis.', solido: true },
  painel_solar: { nome: 'Painel Solar', custo: { vidro: 8, silicio: 10, cabo: 10 }, u: 't3_2', cat: 'energia', prefixo: 'solar', model: 'solar3', gera: 35, solar: true, desc: 'Até 35 ⚡ de graça durante o dia (e um pouco com aurora).', solido: true },
  // código e sinais
  computador: { nome: 'Computador', custo: { placa_ferro: 8, cabo: 6, fio: 20 }, u: 'm0_4', cat: 'codigo', prefixo: 'pc', model: 'computer3', energia: 2, desc: 'Roda seus programas em Jiboia: controla, turbina (.turbo) e organiza as máquinas.', solido: true },
  laboratorio: { nome: 'Laboratório', custo: { placa_ferro: 30, cabo: 20, concreto: 20 }, u: 'm0_5', cat: 'codigo', prefixo: 'lab', tamanho: 3, model: 'lab3', energia: 5, desc: 'Pesquisas extras: mochila, coletor, turbo, Mk2/Mk3, rede… Escolha (E) e mande os itens.', solido: true },
  lampada: { nome: 'Lâmpada', custo: { haste_ferro: 1, cabo: 2, quartzo: 1 }, u: 'm0_4', cat: 'codigo', prefixo: 'lampada', model: 'lamp3', energia: 1, desc: 'Luz programável: .ligar(), .desligar(), .cor("verde"), .piscar().', solido: true },
  tela: { nome: 'Tela', custo: { placa_ferro: 4, cabo: 6, vidro: 2 }, u: 't3_2', cat: 'codigo', prefixo: 'tela', model: 'display', energia: 1, desc: 'Painel programável: .escrever("texto"), .grafico([1, 5, 3]).', solido: true },
  altofalante: { nome: 'Alto-falante', custo: { placa_ferro: 2, cabo: 4 }, u: 't1_3', cat: 'codigo', prefixo: 'som', model: 'speakerBox', energia: 1, desc: 'Toca notas e sons: .tocar("do"), .som("sino").', solido: true },
  // ocultos (sistemas antigos guardados pra versão futura)
  gerador_grande: { nome: 'Gerador Grande', oculto: true, prefixo: 'geradorG', model: 'generatorBig', gera: 60, desc: '', solido: true },
  canteiro: { nome: 'Canteiro', oculto: true, prefixo: 'canteiro', model: 'plot', desc: '', solido: false },
  irrigador: { nome: 'Irrigador', oculto: true, prefixo: 'irrigador', model: 'sprinkler', energia: 1, desc: '', solido: true },
  doca_entrega: { nome: 'Doca de Entrega', oculto: true, prefixo: 'doca_entrega', model: 'deliveryDock', desc: '', solido: true },
  deposito: { nome: 'Depósito de Materiais', oculto: true, prefixo: 'deposito', model: 'depot', desc: '', solido: true },
};
delete MACHINES.bancada_dummy;
for (const m of Object.values(MACHINES)) { m.preco = 0; m.nivel = 1; m.custo = m.custo || {}; }
export const BUILD_CATS = { producao: '🏭 Produção', logistica: '🛤️ Logística', energia: '⚡ Energia', codigo: '🖥️ Código', especial: '⭐ Especiais', construcao: '🧱 Construção' };

// esteiras: multiplicador de velocidade sobre a Mk1 (60/120/270/480/780 itens por minuto)
export const BELT_TIERS = { esteira: 1, esteira_rapida: 2, esteira_expressa: 4.5, esteira_mk4: 8, esteira_mk5: 13 };
export const BELT_MK = { esteira: 1, esteira_rapida: 2, esteira_expressa: 3, esteira_mk4: 4, esteira_mk5: 5 };
export const isBeltTier = (t) => BELT_TIERS[t] !== undefined;
// pureza dos veios (como no Satisfactory): multiplica a velocidade do minerador
export const PURITY = {
  impuro: { nome: 'impuro', mult: 0.5, icone: '▫️', escala: 0.75 },
  normal: { nome: 'normal', mult: 1, icone: '◽', escala: 0.95 },
  puro: { nome: 'puro', mult: 2, icone: '⭐', escala: 1.2 },
};

// Máquinas que podem ser melhoradas pra Mk2 / Mk3 (pesquisas do Laboratório)
export const TIERS = [
  { nome: 'Mk1', vel: 1, energia: 1 },
  { nome: 'Mk2', vel: 2, energia: 2.2, tech: 'mk2', custo: { placa_reforcada: 4, rotor: 2 } },
  { nome: 'Mk3', vel: 4, energia: 4.5, tech: 'mk3', custo: { motor: 2, chip: 2 } },
];
export const TIERABLE = ['minerador', 'fornalha', 'construtora', 'montadora', 'separador', 'laboratorio', 'doca_drones', 'braco'];

// ─── Marcos (Tiers) pagos na Central: cada um libera máquinas, receitas e melhorias ───
export const MILESTONES = [
  { id: 'm0_1', tier: 0, nome: 'Base de Pouso', icone: '🏕️', custo: { haste_ferro: 10 }, libera: ['fornalha', 'esteira', 'bancada'], extra: 'Bancada: fabrique placas, hastes, parafusos, fios, cabos e biomassa na mão', slots: 6 },
  { id: 'm0_2', tier: 0, nome: 'Logística Básica', icone: '🔀', custo: { placa_ferro: 20, haste_ferro: 20 }, libera: ['divisor', 'juntador'], extra: 'Junte vários minérios numa esteira só · mochila +6 · coletor portátil 1,5× mais rápido', coletor: 1.5, slots: 6 },
  { id: 'm0_3', tier: 0, nome: 'Construtora', icone: '🏭', custo: { placa_ferro: 40, parafuso: 60, concreto: 20 }, libera: ['construtora', 'fundacao'], receitas: ['chapa_cobre', 'tijolo', 'engrenagem'], extra: 'Fundações e paredes pra construir em qualquer terreno', slots: 6 },
  { id: 'm0_4', tier: 0, nome: 'Automação', icone: '🖥️', custo: { placa_ferro: 50, cabo: 30, fio: 60 }, libera: ['computador', 'lampada'], extra: 'Programe em Jiboia! maquina("fornalha1").turbo(1.5) acelera por código', cpu: 1 },
  { id: 'm0_5', tier: 0, nome: 'Ciência', icone: '🔬', custo: { placa_reforcada: 5, rotor: 3, cabo: 40, concreto: 50 }, libera: ['laboratorio', 'separador'], extra: 'Pesquisas no Laboratório', slots: 6 },
  { id: 't1_1', tier: 1, nome: 'Montagem', icone: '🔩', custo: { placa_reforcada: 15, rotor: 10, cabo: 60 }, libera: ['montadora', 'esteira_rapida'] },
  { id: 't1_2', tier: 1, nome: 'Logística Avançada', icone: '🌉', custo: { placa_reforcada: 20, haste_ferro: 150, parafuso: 300 }, libera: ['esteira_alta', 'rampa_sobe', 'rampa_desce'], receitas: ['estrutura_modular'] },
  { id: 't1_3', tier: 1, nome: 'Sensores', icone: '📡', custo: { estrutura_modular: 4, cabo: 80, fio: 200 }, libera: ['sensor', 'lixeira', 'altofalante'], extra: 'Clock dos computadores: 5 instr/s', cpu: 2 },
  { id: 't1_4', tier: 1, nome: 'Energia a Carvão', icone: '🔥', custo: { rotor: 20, placa_reforcada: 25, concreto: 150 }, libera: ['gerador_carvao'], slots: 6 },
  { id: 't2_1', tier: 2, nome: 'Siderurgia', icone: '⚒️', custo: { estrutura_modular: 10, rotor: 25, cabo: 100 }, receitas: ['aco', 'viga_aco', 'tubo_aco'] },
  { id: 't2_2', tier: 2, nome: 'Motores', icone: '⚙️', custo: { viga_aco: 40, tubo_aco: 40, placa_reforcada: 40 }, libera: ['braco'], receitas: ['estator', 'motor'], extra: 'Clock dos computadores: 8 instr/s', cpu: 3 },
  { id: 't2_3', tier: 2, nome: 'Projeto Foguete', icone: '🚀', custo: { motor: 10, viga_aco: 60, concreto: 300 }, libera: ['plataforma', 'esteira_expressa'], extra: 'Plataforma de Lançamento: cada fase entregue libera um tier novo', slots: 6 },
  { id: 't3_1', tier: 3, fase: 1, nome: 'Silício', icone: '💾', custo: { motor: 15, viga_aco: 80, cabo: 200 }, receitas: ['silicio', 'vidro', 'chip'] },
  { id: 't3_2', tier: 3, fase: 1, nome: 'Energia Solar', icone: '☀️', custo: { chip: 20, vidro: 40, estrutura_modular: 20 }, libera: ['painel_solar', 'tela'] },
  { id: 't3_3', tier: 3, fase: 1, nome: 'Esteiras Mk4', icone: '🚄', custo: { chip: 30, tubo_aco: 100, motor: 20 }, libera: ['esteira_mk4'], extra: 'Clock dos computadores: 12 instr/s', cpu: 4 },
  { id: 't4_1', tier: 4, fase: 2, nome: 'Cristal KX', icone: '💎', custo: { chip: 50, motor: 30, cristal_kx: 50 }, receitas: ['oscilador', 'processador'], extra: 'Cristal KX só existe nos Campos de Cristal' },
  { id: 't4_2', tier: 4, fase: 2, nome: 'Luminita', icone: '💡', custo: { chip: 50, luminita: 60, estrutura_modular: 30 }, receitas: ['bateria', 'painel_led'], extra: 'Luminita só existe no Pântano Luminoso' },
  { id: 't4_3', tier: 4, fase: 2, nome: 'Drones e Mk5', icone: '🚁', custo: { processador: 20, bateria: 30, motor: 40 }, libera: ['doca_drones', 'esteira_mk5'], slots: 6 },
  { id: 't5_1', tier: 5, fase: 3, nome: 'Computação Quântica', icone: '🧿', custo: { processador: 50, bateria: 50, fragmento_estelar: 10 }, receitas: ['computador_quantico', 'robozinho', 'modulo_foguete'] },
  { id: 't5_2', tier: 5, fase: 3, nome: 'Satélites', icone: '🛰️', custo: { computador_quantico: 5, painel_led: 50, modulo_foguete: 2 }, receitas: ['satelite'] },
];
export const TIER_NAMES = ['Pouso', 'Logística', 'Aço', 'Eletrônica', 'Cristal & Luz', 'Estrelas'];
// fase do foguete que cada tier precisa
export const TIER_PHASE = [0, 0, 0, 1, 2, 3];

// Pesquisas do Laboratório (extras; os marcos são o caminho principal)
export const TECHS = {
  coletor: { nome: 'Coletor Mk2', icone: '🔫', desc: 'Coleta na mão 2× mais rápida.', custo: { placa_reforcada: 5, cabo: 20 }, fase: 0 },
  mochila: { nome: 'Mochila Expandida', icone: '🎒', desc: '+12 espaços no inventário.', custo: { placa_reforcada: 8, fibra: 100 }, fase: 0 },
  sensores: { nome: 'Sensores e Eventos', icone: '📡', desc: 'ouvir(), esperar_evento() e esperar_ate() na Jiboia.', custo: { cabo: 40, fio: 100 }, fase: 0 },
  turbo: { nome: 'Turbo por Código', icone: '⏩', desc: 'O .turbo() dos programas vai até 2× (antes 1,5×).', custo: { rotor: 10, cabo: 50 }, fase: 0 },
  hardware: { nome: 'Hardware dos Computadores', icone: '🧠', desc: 'Overclock e Memória na aba ⚙ Hardware do editor.', custo: { placa_reforcada: 10, cabo: 60 }, fase: 0 },
  rede: { nome: 'Rede de Computadores', icone: '🛰️', desc: 'enviar(), receber(), compartilhar() e ler() entre computadores.', custo: { estrutura_modular: 5, cabo: 80 }, fase: 0, requer: ['sensores'] },
  mk2: { nome: 'Máquinas Mk2', icone: '⬆️', desc: 'Melhore máquinas uma a uma pra Mk2: 2× mais rápidas.', custo: { motor: 5, placa_reforcada: 20 }, fase: 0 },
  mochila2: { nome: 'Mochila Grande', icone: '🧳', desc: '+18 espaços no inventário.', custo: { estrutura_modular: 10, fibra: 300 }, fase: 0, requer: ['mochila'] },
  turbo2: { nome: 'Turbo Máximo', icone: '🔥', desc: 'O .turbo() vai até 2,5×.', custo: { motor: 10, chip: 10 }, fase: 1, requer: ['turbo'] },
  mk3: { nome: 'Máquinas Mk3', icone: '⏫', desc: 'Melhore máquinas pra Mk3: 4× mais rápidas.', custo: { processador: 5, motor: 20 }, fase: 2, requer: ['mk2'] },
  coletor3: { nome: 'Coletor Mk3', icone: '✨', desc: 'Coleta na mão 4× mais rápida.', custo: { oscilador: 5, bateria: 5 }, fase: 2, requer: ['coletor'] },
};
// nomes antigos de pesquisa que agora vêm dos marcos
export const TECH_ALIAS = {
  logistica: 'm0_4', sinais: 'm0_4', rampas: 't1_2', carvao: 't1_4', metalurgia: 't2_1', foguete: 't2_3', solar: 't3_2',
  eletronica: 't4_2', quantica: 't5_1', drones: 't4_3', esteiras_rapidas: 't1_1', esteiras_expressas: 't2_3',
};

// Pesquisas infinitas (depois do lançamento): cada nível custa mais itens e ⭐ Estrelas do Programa Espacial
export const INF_TECHS = {
  mineracao: { nome: 'Mineração Profunda', icone: '⛏️', desc: '+8% de velocidade nos mineradores', efeito: 0.08, custo: { lingote_ferro: 60, engrenagem: 20 } },
  fundicao: { nome: 'Metalurgia Fina', icone: '🔥', desc: '+8% de velocidade nas fornalhas e montadoras', efeito: 0.08, custo: { aco: 30, tijolo: 30 } },
  cpu: { nome: 'Compilador Otimizado', icone: '🧠', desc: '+6% de clock em todos os computadores', efeito: 0.06, custo: { chip: 25, processador: 5 } },
  mercado: { nome: 'Marketing', icone: '💵', desc: '+4% no preço de venda de tudo', efeito: 0.04, custo: { robozinho: 3, painel_led: 5 } },
  logistica: { nome: 'Esteiras Turbo', icone: '🚚', desc: '+5% de velocidade nas esteiras e drones', efeito: 0.05, custo: { motor: 10, bateria: 5 } },
  horta: { nome: 'Adubo Estelar', icone: '🌱', desc: '+10% de crescimento na horta', efeito: 0.1, custo: { grao_cafe: 30, fragmento_estelar: 5 } },
};
export function infCost(id, lvl) {
  const k = Math.pow(1.45, lvl);
  return {
    itens: Object.fromEntries(Object.entries(INF_TECHS[id].custo).map(([i, n]) => [i, Math.round(n * k)])),
    estrelas: 1 + Math.floor(lvl / 2),
  };
}

// Programa Espacial: satélites que ficam em órbita e dão bônus permanentes (até 5 de cada)
export const SATELLITES = {
  comunicacao: { nome: 'Satélite de Comunicação', icone: '📡', desc: '+8% de clock nos computadores', extra: { processador: 6 } },
  mercado: { nome: 'Satélite Financeiro', icone: '💹', desc: '+5% no preço de venda', extra: { robozinho: 3 } },
  gps: { nome: 'Satélite GPS', icone: '🧭', desc: '+6% nas esteiras e drones', extra: { bateria: 6 } },
  clima: { nome: 'Satélite Meteorológico', icone: '🌦️', desc: '+12% de crescimento na horta e mais chuva', extra: { painel_led: 4 } },
  telescopio: { nome: 'Telescópio Espacial', icone: '🔭', desc: 'Mais chuvas de meteoros e veios maiores', extra: { fragmento_estelar: 12 } },
  energia: { nome: 'Estação Solar Orbital', icone: '🛰️', desc: '+20% nos painéis solares, e eles geram um pouco à noite', extra: { painel_led: 3, bateria: 3 } },
};
export const SAT_MAX = 5;
// o que a missão n (0 = segundo lançamento) pede
export function missionNeeds(n, sat) {
  const k = 1 + 0.4 * n;
  const itens = { modulo_foguete: 2 + n, satelite: 1 + Math.floor(n / 3) };
  for (const [i, q] of Object.entries(SATELLITES[sat].extra)) itens[i] = (itens[i] || 0) + Math.round(q * k);
  return itens;
}
export const missionPrize = (n) => ({ dinheiro: Math.round(20000 * (1 + 0.5 * n)), estrelas: 2 + Math.floor(n / 2) });

// Projeto Foguete: fases entregues na Plataforma de Lançamento (tipo o Elevador Espacial do Satisfactory)
export const PHASES = [
  { nome: 'Fundação', itens: { placa_reforcada: 60, estrutura_modular: 20, concreto: 300 }, libera: 'Tier 3 · Eletrônica', desc: 'A base da plataforma e a torre de serviço.' },
  { nome: 'Estrutura', itens: { motor: 40, viga_aco: 150, chip: 50 }, libera: 'Tier 4 · Cristal & Luz', desc: 'O corpo e os tanques do foguete.' },
  { nome: 'Controle', itens: { processador: 40, bateria: 60, painel_led: 40 }, libera: 'Tier 5 · Estrelas', desc: 'Computador de bordo e a ponta.' },
  { nome: 'Lançamento!', itens: { modulo_foguete: 10, satelite: 3, computador_quantico: 5 }, final: true, desc: 'Carregue o foguete e lance pro céu de KX-7.' },
];

// (3.0: o mapa inteiro é seu desde o começo; regiões compráveis não existem mais)
export const REGIONS = {};

// Bônus de decoração (dentro de 3 células): cpu = +clock dos computadores, vel = +velocidade das máquinas
export const DECOR_BONUS = {
  planta: { cpu: 0.05 }, flores: { cpu: 0.04 }, arvore: { cpu: 0.06 },
  luminaria: { vel: 0.05 }, barris: { vel: 0.03 }, antena: { cpu: 0.05, vel: 0.05 },
  sofa: { cpu: 0.03 }, cafeteira: { vel: 0.04 }, banco: { cpu: 0.02 },
  estatua: { cpu: 0.1, vel: 0.1, raio: 5 },
  astronauta: { cpu: 0.06 }, alien: { vel: 0.05 }, rover: { cpu: 0.04, vel: 0.04 }, nave: { cpu: 0.08, raio: 4 },
  estante: { cpu: 0.04 }, poltrona: { cpu: 0.03 }, tv: { cpu: 0.02 }, urso: { cpu: 0.03 }, sofa_longo: { cpu: 0.04 },
  mesa_redonda: { cpu: 0.02 }, tapete: { cpu: 0.02 }, luminaria_piso: { vel: 0.04 }, geladeira: { vel: 0.03 }, vaso_flor: { cpu: 0.03 },
};
export const DECOR_BONUS_MAX = 0.3;

export const ACHIEVEMENTS = [
  // 3.0
  { id: 'central', nome: 'Lar doce lar', desc: 'Monte a Central em KX-7.', icone: '🏠' },
  { id: 'marco', nome: 'Primeiro marco', desc: 'Pague um Marco na Central.', icone: '🏁' },
  { id: 'tier1', nome: 'Pé no chão', desc: 'Complete o Tier 0.', icone: '🏕️' },
  { id: 'tier3', nome: 'Siderúrgica', desc: 'Complete o Tier 2.', icone: '⚒️' },
  { id: 'tier5', nome: 'Rumo às estrelas', desc: 'Complete todos os tiers.', icone: '🌠' },
  { id: 'mao_100', nome: 'Na raça', desc: 'Minere 100 minérios na mão.', icone: '✊' },
  { id: 'coleta_100', nome: 'Lenhador(a) alienígena', desc: 'Colete 100 plantas.', icone: '🪓' },
  { id: 'fundacoes', nome: 'Terraplanagem', desc: 'Coloque 50 fundações.', icone: '🟫' },
  { id: 'mk5', nome: 'Rodovia expressa', desc: 'Coloque uma Esteira Mk5.', icone: '🚄' },
  { id: 'jupiter', nome: 'Gigante no céu', desc: 'Veja Júpiter na Grande Aproximação.', icone: '🪐' },
  { id: 'eclipse', nome: 'O dia virou noite', desc: 'Veja um eclipse: a lua Mira passando na frente do sol.', icone: '🌑' },
  { id: 'turbo', nome: 'Overclock na veia', desc: 'Turbine uma máquina por código (.turbo).', icone: '⏩' },
  { id: 'explorador', nome: 'Volta ao mundo', desc: 'Pise nos cinco biomas de KX-7.', icone: '🧭' },
  { id: 'primeiro_minerio', nome: 'Primeira pedrinha', desc: 'Minere o primeiro minério.', icone: '⛏️' },
  { id: 'primeira_venda', nome: 'Primeiro dinheirinho', desc: 'Venda algo.', icone: '💰', oculto: true },
  { id: 'primeiro_programa', nome: 'Olá, mundo', desc: 'Rode um programa.', icone: '🐍' },
  { id: 'vendeu_100', nome: 'Comerciante', desc: 'Venda 100 itens.', icone: '🧺', oculto: true },
  { id: 'vendeu_1000', nome: 'Magnata', desc: 'Venda 1.000 itens.', icone: '🏦', oculto: true },
  { id: 'rico_1k', nome: 'Primeiro milhar', desc: 'Tenha $ 1.000.', icone: '💵', oculto: true },
  { id: 'rico_10k', nome: 'Rico', desc: 'Tenha $ 10.000.', icone: '💎', oculto: true },
  { id: 'rico_100k', nome: 'Milionário (quase)', desc: 'Tenha $ 100.000.', icone: '👑', oculto: true },
  { id: 'lingote', nome: 'Forjado no fogo', desc: 'Faça um lingote.', icone: '🔥' },
  { id: 'engrenagem', nome: 'Engrenado', desc: 'Fabrique uma engrenagem.', icone: '⚙️' },
  { id: 'chip', nome: 'Vale do Silício', desc: 'Fabrique um chip.', icone: '💾' },
  { id: 'robozinho', nome: 'Pai de robô', desc: 'Fabrique um robozinho.', icone: '🤖' },
  { id: 'cinco_pcs', nome: 'Data center', desc: 'Tenha 5 computadores rodando.', icone: '🖥️' },
  { id: 'erros_10', nome: 'Errar é humano', desc: 'Tenha 10 erros de programa. Faz parte!', icone: '🐛' },
  { id: 'ouro', nome: 'Código de ouro', desc: 'Ganhe uma medalha de ouro no placar.', icone: '🥇', oculto: true },
  { id: 'pesquisa', nome: 'Cientista', desc: 'Termine uma pesquisa.', icone: '🔬' },
  { id: 'todas_pesquisas', nome: 'Sabe-tudo', desc: 'Termine todas as pesquisas.', icone: '🎓' },
  { id: 'fase1', nome: 'Pé na estrada', desc: 'Complete a fase 1 do foguete.', icone: '🏗️' },
  { id: 'foguete', nome: 'Houston, temos um jogo', desc: 'Lance o foguete!', icone: '🚀' },
  { id: 'regiao', nome: 'Desbravador', desc: 'Compre uma região nova.', icone: '🗺️', oculto: true },
  { id: 'todas_regioes', nome: 'Dono do mapa', desc: 'Compre todas as regiões.', icone: '🌎', oculto: true },
  { id: 'drone', nome: 'Controle aéreo', desc: 'Faça um drone voar.', icone: '🚁' },
  { id: 'rede', nome: 'Conectado', desc: 'Mande uma mensagem pela rede.', icone: '🛰️' },
  { id: 'biblioteca', nome: 'Reaproveitador', desc: 'Use importar() numa biblioteca.', icone: '📚' },
  { id: 'depurador', nome: 'Caçador de bugs', desc: 'Pare num breakpoint do depurador.', icone: '🔍' },
  { id: 'musico', nome: 'Maestro', desc: 'Toque 8 notas no alto-falante.', icone: '🎹' },
  { id: 'esteiras_100', nome: 'Rodovia', desc: 'Tenha 100 esteiras.', icone: '🛤️' },
  { id: 'noite', nome: 'Turno da noite', desc: 'Veja a fábrica funcionando à noite.', icone: '🌙' },
  { id: 'chuva', nome: 'Cantando na chuva', desc: 'Fique na chuva.', icone: '🌧️' },
  { id: 'foto', nome: 'Fotógrafo', desc: 'Tire uma foto no modo foto.', icone: '📷' },
  { id: 'cafe_10', nome: 'Cafeinado', desc: 'Tome 10 cafezinhos.', icone: '☕', oculto: true },
  { id: 'pet', nome: 'Melhor amigo', desc: 'Faça carinho no Oopi.', icone: '💜' },
  { id: 'mk3', nome: 'Turbinado', desc: 'Melhore uma máquina pra Mk3.', icone: '⏫' },
  { id: 'copiar', nome: 'Ctrl+C, Ctrl+V', desc: 'Cole um grupo de máquinas.', icone: '📋' },
  { id: 'horta', nome: 'Mão verde', desc: 'Faça a primeira colheita na horta.', icone: '🌱', oculto: true },
  { id: 'colheita_100', nome: 'Fazendeiro(a)', desc: 'Colha 100 itens.', icone: '🧑‍🌾', oculto: true },
  { id: 'estufa', nome: 'Efeito estufa (do bom)', desc: 'Colha um canteiro debaixo de um teto de vidro.', icone: '🪴', oculto: true },
  { id: 'arquiteto', nome: 'Arquiteto(a)', desc: 'Construa 30 peças (paredes, pisos, tetos...).', icone: '🏗️' },
  { id: 'pintor', nome: 'Mão na tinta', desc: 'Pinte uma parede.', icone: '🖌️', oculto: true },
  { id: 'galeria', nome: 'Galeria de arte', desc: 'Pendure 3 quadros.', icone: '🖼️', oculto: true },
  { id: 'meteoro', nome: 'Poeira de estrelas', desc: 'Pegue um fragmento estelar.', icone: '☄️' },
  { id: 'aurora', nome: 'Luzes do céu', desc: 'Veja uma aurora.', icone: '🌌' },
  { id: 'feira', nome: 'Dia de feira', desc: 'Venda durante uma feira.', icone: '🎪', oculto: true },
  { id: 'overclock', nome: 'Overclock', desc: 'Melhore o hardware de um computador.', icone: '⏩', oculto: true },
  { id: 'recorde', nome: 'Recordista', desc: 'Bata um recorde da fábrica.', icone: '🏆' },
  { id: 'oopi_tarefa', nome: 'Oopi ajudante', desc: 'Peça uma tarefa pro Oopi.', icone: '🤖' },
  // v1.3
  { id: 'contrato', nome: 'Negócio fechado', desc: 'Cumpra um contrato.', icone: '📋', oculto: true },
  { id: 'contratos_25', nome: 'Fornecedor oficial', desc: 'Cumpra 25 contratos.', icone: '🤝', oculto: true },
  { id: 'lendario', nome: 'Lenda do bairro', desc: 'Cumpra um contrato lendário.', icone: '🌟', oculto: true },
  { id: 'relampago', nome: 'Entrega relâmpago', desc: 'Cumpra um contrato na primeira metade do prazo.', icone: '⚡', oculto: true },
  { id: 'desafio', nome: 'Quebra-cabeça', desc: 'Resolva um desafio de programação.', icone: '🧩', oculto: true },
  { id: 'desafio_ouro', nome: 'Perfeccionista', desc: 'Ganhe as 3 medalhas de ouro num desafio.', icone: '🏅', oculto: true },
  { id: 'desafios_todos', nome: 'Mestre da Jiboia', desc: 'Resolva todos os desafios.', icone: '🐍', oculto: true },
  { id: 'disco', nome: 'Arqueologia de dados', desc: 'Encontre um disco de dados.', icone: '💾' },
  { id: 'receita_alt', nome: 'Receita da vovó', desc: 'Libere uma receita alternativa.', icone: '📜' },
  { id: 'satelite2', nome: 'Constelação', desc: 'Lance uma segunda missão espacial.', icone: '🛰️', oculto: true },
  { id: 'missao_5', nome: 'Agência espacial', desc: 'Complete 5 missões do Programa Espacial.', icone: '🌌', oculto: true },
  { id: 'infinita', nome: 'Sem limites', desc: 'Termine uma pesquisa infinita.', icone: '♾️', oculto: true },
  { id: 'quantico', nome: 'Ação fantasmagórica', desc: 'Fabrique um computador quântico.', icone: '🧿' },
  { id: 'combo_10', nome: 'Combo!', desc: 'Faça um combo de vendas ×10.', icone: '🔥', oculto: true },
  { id: 'correio_7', nome: 'Freguesia fiel', desc: 'Abra o correio da manhã 7 dias seguidos.', icone: '📬', oculto: true },
  { id: 'projeto', nome: 'Projetista', desc: 'Salve um projeto de máquinas.', icone: '📐' },
  { id: 'album', nome: 'Colecionador(a)', desc: 'Descubra todos os itens do álbum.', icone: '📖' },
  { id: 'chapeu', nome: 'Estiloso', desc: 'Coloque um chapéu no Oopi.', icone: '🎩', oculto: true },
  { id: 'amizade', nome: 'Amigos pra sempre', desc: 'Chegue à amizade nível 5 com o Oopi.', icone: '💞', oculto: true },
  // v1.4
  { id: 'semanal', nome: 'Toda semana tem', desc: 'Resolva um desafio da semana.', icone: '📅', oculto: true },
  { id: 'placar', nome: 'Competição saudável', desc: 'Coloque a nota de um amigo no placar da semana.', icone: '🏁', oculto: true },
  { id: 'visita', nome: 'Visita de cortesia', desc: 'Visite a fábrica de um amigo.', icone: '👀', oculto: true },
  { id: 'parceria', nome: 'Juntos somos mais', desc: 'Conclua uma parceria com um amigo.', icone: '🤝', oculto: true },
  { id: 'braco', nome: 'Mão na massa', desc: 'Mova 50 itens com braços robóticos.', icone: '🦾' },
  { id: 'oopi_prog', nome: 'Oopi, obedeça!', desc: 'Dê uma ordem pro Oopi por código.', icone: '📟' },
];

// Contratos: clientes e o que eles gostam de pedir
export const CLIENTS = [
  { nome: 'Padaria da Dona Cida', icone: '🥖', gosta: ['milho', 'cenoura', 'abobora', 'grao_cafe', 'lingote_ferro'] },
  { nome: 'Oficina do Seu Zé', icone: '🔧', gosta: ['engrenagem', 'motor', 'lingote_ferro', 'aco', 'viga'] },
  { nome: 'Cafeteria Grão Bom', icone: '☕', gosta: ['grao_cafe', 'melancia', 'milho', 'vidro'] },
  { nome: 'Construtora Tijolinho', icone: '🧱', gosta: ['tijolo', 'concreto', 'vidro', 'madeira', 'aco', 'viga'] },
  { nome: 'Robótica Estrela', icone: '🤖', gosta: ['chip', 'motor', 'robozinho', 'processador', 'bateria'] },
  { nome: 'Escola de Programação da Prof. Ada', icone: '🎓', gosta: ['chip', 'fio', 'silicio', 'processador', 'painel_led'] },
  { nome: 'Agência Espacial Tupi', icone: '🛰️', gosta: ['modulo_foguete', 'satelite', 'computador_quantico', 'bateria', 'processador'] },
  { nome: 'Feira do Bairro', icone: '🎪', gosta: ['melancia', 'abobora', 'cenoura', 'milho', 'fio'] },
  { nome: 'Joalheria Cometa', icone: '💎', gosta: ['fragmento_estelar', 'quartzo', 'lingote_cobre', 'silicio'] },
  { nome: 'Estúdio de Luz Neon', icone: '💡', gosta: ['painel_led', 'fio', 'vidro', 'bateria', 'lingote_cobre'] },
];
export const RARITY = {
  comum: { nome: 'Comum', mult: 1.6, fichas: 1, cor: '#9fb4d6', prazo: 600 },
  raro: { nome: 'Raro', mult: 2.2, fichas: 2, cor: '#3ee6b8', prazo: 900 },
  lendario: { nome: 'Lendário', mult: 3, fichas: 4, cor: '#ffcf5c', prazo: 1500 },
};

// Loja de fichas 🎟️: chapéus e cores do Oopi
export const OOPI_HATS = {
  flor: { nome: 'Florzinha', model: 'hat_flower', fichas: 3, y: 0.02 },
  cone: { nome: 'Cone de obra', model: 'hat_cone', fichas: 4, y: -0.02 },
  cogumelo: { nome: 'Cogumelo', model: 'hat_mushroom', fichas: 5, y: -0.03 },
  engrenagem: { nome: 'Engrenagem', model: 'cog', fichas: 5, y: 0.04, deitado: true },
  antena: { nome: 'Antena parabólica', model: 'hat_dish', fichas: 7, y: 0 },
  coroa: { nome: 'Coroa de cristal', model: 'hat_crystal', fichas: 10, y: 0 },
};
export const OOPI_COLORS = {
  padrao: { nome: 'Original', cor: null, fichas: 0 },
  rosa: { nome: 'Rosa', cor: 0xff8ac7, fichas: 2 },
  menta: { nome: 'Menta', cor: 0x7ff0c0, fichas: 2 },
  lavanda: { nome: 'Lavanda', cor: 0xb8a4ff, fichas: 2 },
  dourado: { nome: 'Dourado', cor: 0xffcf5c, fichas: 4 },
  grafite: { nome: 'Grafite', cor: 0x555a6a, fichas: 3 },
};
// amizade do Oopi: pontos pra cada nível (carinho +1, tarefa +3)
export const FRIEND_LEVELS = [0, 10, 30, 60, 100];
export const FRIEND_PERKS = ['', 'Ganha a florzinha de presente 🌼', 'Pega as pedrinhas de meteoro sozinho quando está perto', 'Ganha a coroa de cristal de presente 👑', 'Oopi sortudo: +1 ficha a cada contrato raro ou lendário'];

// Correio da manhã: presente de cada dia da sequência (repete a cada 7)
export const DAILY = [
  { dinheiro: 1 }, { dinheiro: 1.5 }, { fichas: 1 }, { dinheiro: 2 }, { disco: 1 }, { dinheiro: 2.5 }, { fichas: 3, dinheiro: 3 },
];

// ferramentas que ficam sempre na barra
export const TOOLS = {
  cabo: {
    nome: 'Cabo 🔌',
    desc: 'Clique no gerador (ou poste) e depois na máquina pra ligar. Continua ligando em sequência. Botão direito / Q para. X remove os cabos da peça mirada.',
  },
  construir: {
    nome: 'Construção 🧱',
    desc: 'Paredes, janelas, portas, pisos, tetos e cercas. F troca a peça, T troca o material (ou a cor no 🖌️ Pintar). Paredes ficam na borda mais perto da mira. X desmonta e devolve o material.',
  },
};

// quantos cabos cada coisa aceita
export const WIRE_MAX = { poste: 6, gerador: 4, gerador_grande: 6, gerador_carvao: 4, painel_solar: 2 };
export const WIRE_MAX_MACHINE = 2;
export const WIRE_MAX_LEN = 16; // metros

// Decoração — pra deixar a fábrica aconchegante
export const DECOR = {
  planta: { nome: 'Vaso de Planta', preco: 15, nivel: 1, model: 'd_plant', bonus: '+5% CPU nos computadores perto' },
  flores: { nome: 'Flores', preco: 10, nivel: 1, model: 'd_flowers', bonus: '+4% CPU nos computadores perto' },
  arvore: { nome: 'Cristal Gigante', preco: 40, nivel: 2, model: 'd_tree', bonus: '+6% CPU nos computadores perto' },
  banco: { nome: 'Banco', preco: 40, nivel: 2, model: 'd_bench', bonus: '+2% CPU perto' },
  luminaria: { nome: 'Luminária', preco: 50, nivel: 3, model: 'd_lamp', luz: true, bonus: '+5% velocidade nas máquinas perto' },
  sofa: { nome: 'Sofá', preco: 80, nivel: 3, model: 'd_sofa', bonus: '+3% CPU perto' },
  cafeteira: { nome: 'Cafeteira', preco: 60, nivel: 4, model: 'd_coffee', bonus: '+4% velocidade nas máquinas perto' },
  barris: { nome: 'Barris', preco: 30, nivel: 4, model: 'd_barrels', bonus: '+3% velocidade nas máquinas perto' },
  antena: { nome: 'Antena Parabólica', preco: 150, nivel: 5, model: 'd_dish', bonus: '+5% CPU e velocidade perto' },
  estatua: { nome: 'Estátua do Oopi', preco: 1500, nivel: 8, model: 'd_statue', bonus: '+10% CPU e velocidade num raio grande' },
  // exclusivos da loja de fichas 🎟️
  astronauta: { nome: 'Astronauta', preco: 0, fichas: 6, nivel: 1, model: 'd_astronaut', bonus: '+6% CPU nos computadores perto' },
  alien: { nome: 'Alienzinho', preco: 0, fichas: 6, nivel: 1, model: 'd_alien', bonus: '+5% velocidade nas máquinas perto' },
  rover: { nome: 'Rover Lunar', preco: 0, fichas: 8, nivel: 1, model: 'd_rover', bonus: '+4% CPU e velocidade perto' },
  nave: { nome: 'Nave Estelar', preco: 0, fichas: 12, nivel: 1, model: 'd_ship', bonus: '+8% CPU num raio de 4 células' },
  // móveis do escritório (podem ficar dentro do escritório)
  estante: { nome: 'Estante de Livros', preco: 70, nivel: 1, model: 'o_bookcase', casa: true, bonus: '+4% CPU perto' },
  poltrona: { nome: 'Poltrona', preco: 60, nivel: 1, model: 'o_armchair', casa: true, bonus: '+3% CPU perto' },
  sofa_longo: { nome: 'Sofá Grande', preco: 110, nivel: 2, model: 'o_sofaLong', casa: true, bonus: '+4% CPU perto' },
  tv: { nome: 'TV com Rack', preco: 140, nivel: 2, model: 'o_tv', casa: true, bonus: '+2% CPU perto' },
  tapete: { nome: 'Tapete', preco: 25, nivel: 1, model: 'o_rug', casa: true, baixo: true, bonus: '+2% CPU perto' },
  luminaria_piso: { nome: 'Luminária de Pé', preco: 45, nivel: 1, model: 'o_floorLamp', casa: true, luz: true, bonus: '+4% velocidade perto' },
  mesa_redonda: { nome: 'Mesa Redonda', preco: 50, nivel: 1, model: 'o_tableRound', casa: true, bonus: '+2% CPU perto' },
  cadeira: { nome: 'Cadeira', preco: 20, nivel: 1, model: 'o_chair', casa: true },
  mesinha: { nome: 'Mesinha com Abajur', preco: 40, nivel: 1, model: 'o_sideTable', casa: true, luz: true },
  geladeira: { nome: 'Frigobar', preco: 90, nivel: 2, model: 'o_fridge', casa: true, bonus: '+3% velocidade perto' },
  cabideiro: { nome: 'Cabideiro', preco: 20, nivel: 1, model: 'o_coatRack', casa: true },
  urso: { nome: 'Ursinho de Pelúcia', preco: 30, nivel: 1, model: 'o_bear', casa: true, bonus: '+3% CPU perto (fofura)' },
  vaso_flor: { nome: 'Plantinha', preco: 15, nivel: 1, model: 'o_plant', casa: true, bonus: '+3% CPU perto' },
  ventilador: { nome: 'Ventilador de Teto', preco: 60, nivel: 2, model: 'o_fan', casa: true, noTeto: true },
};

// Ritmo global (o clock da CPU sobe com os marcos; a esteira base é a Mk1 = 60 itens/min)
export const UPGRADES = {
  cpu: { nome: 'Clock da CPU', desc: 'Instruções por segundo em todos os computadores', valores: [2, 3, 5, 8, 12], precos: [], niveis: [], unidade: ' instr/s' },
  esteira: { nome: 'Esteiras', desc: 'Velocidade base das esteiras (células/s)', valores: [0.5], precos: [], niveis: [], unidade: ' células/s' },
  maquinas: { nome: 'Máquinas', desc: 'Velocidade das máquinas', valores: [1], precos: [], niveis: [], unidade: 'x' },
};

export function xpForLevel(level) { return Math.round(100 * Math.pow(1.6, level - 1)); }
export function unlocksAt() { return []; }

// kit que vem na cápsula de pouso
export const START_KIT = { placa_ferro: 40, haste_ferro: 30, parafuso: 60, fio: 40, cabo: 20, concreto: 20, biomassa: 30 };
export const START_INVENTORY = {};
export const START_MONEY = 0;
export const START_SLOTS = 30;

export const STARTER_CODE = `# Bem-vindo à Jiboia! 🐍  (parecida com Python)
# As máquinas já trabalham sozinhas quando ligadas (E → LIGAR).
# O código é o seu superpoder: controla, organiza e TURBINA a fábrica.

forno = maquina("fornalha1")
forno.receita("lingote_ferro")
forno.ligar()

while True:
    forno.turbo(1.5)      # 50% mais rápida enquanto o programa roda (gasta mais ⚡)
    print("lingotes esperando:", forno.saida())
    esperar(5)
`;

export const EXAMPLES = [
  { nome: 'Turbinar a fornalha', code: STARTER_CODE },
  {
    nome: 'Minerador que não entope', code: `# Desliga o minerador quando o contêiner enche, liga quando esvazia
mina = maquina("minerador1")
bau = maquina("bau1")

while True:
    if bau.quantidade() >= 200:
        mina.desligar()
    else:
        mina.ligar()
    esperar(2)
`,
  },
  {
    nome: 'Construtora que troca de receita', code: `# Faz parafusos quando o seu inventário tem poucos, senão faz placas
c = maquina("construtora1")

while True:
    if inventario("parafuso") < 100:
        c.receita("parafuso")
    else:
        c.receita("placa_ferro")
    c.ligar()
    esperar(10)
`,
  },
  {
    nome: 'Separador por tipo', code: `# Esteira com vários minérios misturados: ferro pra esquerda, cobre pra direita
sep = maquina("separador1")

while True:
    item = sep.esperar_item()
    if item == "minerio_ferro":
        sep.enviar("esquerda")
    elif item == "minerio_cobre":
        sep.enviar("direita")
    else:
        sep.enviar("frente")
`,
  },
  {
    nome: 'Balanceador (1 pra cada lado)', code: `# Reparte os itens igualzinho entre três linhas
sep = maquina("separador1")
lados = ["esquerda", "frente", "direita"]
i = 0
while True:
    sep.esperar_item()
    sep.enviar(lados[i])
    i = (i + 1) % 3
`,
  },
  {
    nome: 'Turbo em todas as máquinas', code: `# Turbina várias máquinas de uma vez (cuidado com a energia ⚡!)
nomes = ["fornalha1", "fornalha2", "construtora1"]

def turbinar(lista, k):
    for n in lista:
        maquina(n).turbo(k)

while True:
    e = energia()
    if e["usado"] < e["gerado"] * 0.8:
        turbinar(nomes, 1.5)
    esperar(5)
`,
  },
  {
    nome: '🛰️ Rede: chefe e ajudante', code: `# Precisa da pesquisa "Rede de Computadores"
# pc1 manda ordens, pc2 obedece (rode este no pc1)
while True:
    enviar("pc2", "turbo")
    compartilhar("ultimo_pedido", tempo())
    esperar(5)

# --- no pc2, use: ---
# while True:
#     m = receber()
#     if m["msg"] == "turbo":
#         maquina("fornalha1").turbo(2)
`,
  },
  {
    nome: '📡 Eventos do sensor', code: `# Precisa da pesquisa "Sensores e Eventos" e de uma Esteira com Sensor
ouvir("sensor1")      # avisa cada item que passa
ouvir("tempo", 60)    # e um "tique" a cada 60 s
total = 0
while True:
    e = esperar_evento()
    if e["tipo"] == "item":
        total += 1
    elif e["tipo"] == "tempo":
        print("itens por minuto:", total)
        total = 0
`,
  },
  {
    nome: '🚁 Drone entregador', code: `# Precisa de uma Doca de Drones (Tier 4)
d = maquina("drone1")
while True:
    d.ir_para("bau1")
    item = d.pegar()          # pega 1 item do contêiner
    d.ir_para("bau2")
    d.soltar()
    print("entreguei", item)
`,
  },
  {
    nome: '💡 Tela e lâmpada de status', code: `# Painel de energia (Tela e Lâmpada)
t = maquina("tela1")
l = maquina("lampada1")
t.titulo("Energia")
historico = []
while True:
    e = energia()
    historico.append(e["usado"])
    if len(historico) > 30:
        historico.pop(0)
    t.grafico(historico)
    if e["usado"] > e["gerado"]:
        l.cor("vermelho")
        l.piscar(0.5)
    else:
        l.cor("verde")
        l.ligar()
    esperar(5)
`,
  },
  {
    nome: '🎹 Musiquinha', code: `# Precisa de um Alto-falante
som = maquina("som1")
musica = ["do", "mi", "sol", "do5", "sol", "mi", "do"]
for nota in musica:
    som.tocar(nota, 0.25)
som.som("sino")
`,
  },
];

export const OBJECTIVES = [
  { id: 'hub', texto: 'Monte a 🏠 Central (HUB) num lugar plano perto da cápsula: escolha na barra (teclas 1-9) e clique. Ela ocupa 3×3 células.' },
  { id: 'hand', texto: 'Segure E (ou o clique) mirando num veio de Ferro (pedras azuladas) pra minerar 10 minérios na mão.' },
  { id: 'miner', texto: 'Monte um ⛏️ Minerador num veio e um 🔥 Gerador de Biomassa perto. Ponha biomassa no gerador (E), ligue um cabo 🔌 do gerador até o minerador e aperte LIGAR nele.' },
  { id: 'm0_1', texto: 'Abra a Central (E) e pague o Marco 🏕️ Base de Pouso: libera Fornalha, Esteira e Bancada.' },
  { id: 'smelt', texto: 'Leve o minério até uma Fornalha (esteira ou na mão), escolha Lingote de Ferro e aperte LIGAR. Faça 10 lingotes.' },
  { id: 'craft', texto: 'Na Bancada (Central → aba Bancada) fabrique Hastes e Placas na mão: segure o botão da receita.' },
  { id: 'm0_2', texto: 'Pague o Marco 🔀 Logística Básica: Divisor e Juntador. Dica: árvores dão madeira e folhas, combustível pro gerador.' },
  { id: 'm0_3', texto: 'Pague o Marco 🏭 Construtora e ponha uma Construtora depois da fornalha fazendo placas sozinha.' },
  { id: 'm0_4', texto: 'Pague o Marco 🖥️ Automação, monte um Computador (E) e rode o programa que turbina a fornalha.' },
  { id: 'tier0', texto: 'Complete o Tier 0: pague o Marco 🔬 Ciência.' },
  { id: 'tier1', texto: 'Complete o Tier 1 (Logística). Junte minérios numa esteira só com o Juntador e separe com o Separador.' },
  { id: 'tier2', texto: 'Complete o Tier 2 (Aço) e monte a 🚀 Plataforma de Lançamento.' },
  { id: 'fase1', texto: 'Entregue a Fase 1 do Projeto Foguete na plataforma (libera o Tier 3).' },
  { id: 'explore', texto: 'Explore KX-7: o Cristal KX está nos Campos de Cristal 💎 e a Luminita no Pântano Luminoso 🍄.' },
  { id: 'fase3', texto: 'Entregue as Fases 2 e 3 do Projeto Foguete.' },
  { id: 'launch', texto: 'Lance o foguete! 🚀' },
];
