// Guia ilustrado (aparece com a tecla H e na aba "Guia" do editor).

const code = (s) => `<pre class="doc-code">${s.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>`;


export function guideHTML() {
  // 3.0: gerado a partir do GUIA.md
  return `
<div class="doc guide">
<h2>📖 Guia do AUTOMATON 3.0</h2>
<p class="muted">Esse guia também está <b>dentro do jogo</b>: aperte <b><kbd>H</kbd></b> (ou <b>Pausa → <kbd>guia()</kbd></b>).</p>
<p>Você é a primeira pessoa a pousar em <b>KX-7</b>, um planeta com cinco biomas, um céu dominado por <b>Júpiter</b> e uma flora que brilha à noite. Não tem loja nem dinheiro: tudo que você constrói é feito com <b>itens</b> que você mesmo coleta, derrete e monta. O objetivo grande é o <b>Projeto Foguete</b>. E a diferença do AUTOMATON é o <b>código</b>: as máquinas trabalham sozinhas, mas um computador programado em <b>Jiboia</b> pode <b>turbinar</b> a fábrica.</p>
<h3>1. Começo: escolha onde pousar</h3>
<p><b>Menu → Modo Livre</b> (o <b>Modo História</b> chega em breve 🔒).</p>
<ol>
<li>Escolha uma das <b>3 áreas de pouso</b>:</li>
<li class="sub">🌲 <b>Floresta das Serras</b> (fácil): vales verdes, montanhas, lagos; ferro, cobre, calcário e carvão perto, muita madeira.</li>
<li class="sub">🏜️ <b>Cânion Vermelho</b> (média): mesas de pedra, cânions fundos; ferro e cobre <b>puros</b>, quartzo, pouca planta.</li>
<li class="sub">❄️ <b>Tundra Gelada</b> (difícil): planalto de neve, lagos congelados, as auroras mais fortes; muito carvão e calcário.</li>
<li><b>Semente</b>: cada semente (ex.: <kbd>KX-2744</kbd>) gera sempre o mesmo planeta. Use 🎲 pra sortear ou digite a de um amigo.</li>
<li><b>Pousar em KX-7</b>: a cápsula desce do céu, e você começa ao lado dela com um <b>kit</b>: placas e hastes de ferro, parafusos, fios, cabos, concreto e biomassa.</li>
</ol>
<p>O planeta tem mais <b>dois biomas pra explorar</b> (não dá pra pousar neles): <b>Campos de Cristal</b> (Cristal KX) e <b>Pântano Luminoso</b> (Luminita). Os recursos raros só existem lá.</p>
<h3>2. Coletar com a ferramenta</h3>
<p>Segure <b><kbd>E</kbd></b> (ou o botão esquerdo) mirando:</p>
<ul>
<li>num <b>veio de minério</b> (pedras coloridas no chão) → sai 1 minério por vez. Veio <b>puro</b> é mais rápido, <b>impuro</b> mais lento;</li>
<li>numa <b>planta</b> → ela some e solta <b>madeira, folhas, fibra, esporos ou quartzo</b> (cada espécie dá uma coisa).</li>
</ul>
<p>O que você coleta vai pra <b>mochila 🎒</b> (tem um número de espaços; os Marcos aumentam).</p>
<p>Desde o pouso você já pode montar <b>⛏️ Minerador</b>, <b>🔥 Gerador de Biomassa</b>, <b>poste</b> e <b>📦 Contêiner</b> (pagando o custo em itens do kit). O minerador ocupa 3×3: coloque com o <b>meio em cima de um veio</b> (a broca desce nele), o gerador do lado, ponha <b>biomassa, madeira ou folhas</b> no gerador (<kbd>E</kbd>), ligue um <b>cabo</b> e aperte <b>LIGAR</b> no minerador.</p>
<h3>3. A Central e os Marcos</h3>
<p>Primeiro passo: monte a <b>🏠 Central (HUB)</b> num lugar plano (tecla <kbd>1</kbd> e clique). Ela ocupa 3×3.</p>
<p>Aperte <b><kbd>E</kbd></b> na Central:</p>
<ul>
<li><b>Marcos</b>: pague com itens pra liberar máquinas, receitas e melhorias. Os marcos são organizados em <b>Tiers 0 a 5</b>; alguns tiers precisam de uma <b>fase do Projeto Foguete</b> antes.</li>
<li><b>Bancada</b>: fabrique peças <b>na mão</b> (segure o botão da receita). Ótimo no começo, antes de ter fornalha e construtora.</li>
<li><b>Inventário</b>: tudo que você tem.</li>
</ul>
<h3>4. Construir</h3>
<ul>
<li><b><kbd>B</kbd></b> abre o menu de construção (categorias, custo de cada peça, e dá pra <b>fixar na barra</b> de 1 a 9).</li>
<li>Clique pra colocar, <b><kbd>R</kbd></b> gira, <b><kbd>X</kbd></b> desmonta (devolve <b>todos</b> os itens), <b><kbd>Ctrl+Z</kbd></b> desfaz. O nome de cada máquina (pro código) aparece quando você mira nela.</li>
<li>Máquinas precisam de chão <b>plano</b>; esteiras aceitam <b>rampa</b> suave. Num morro, ponha <b>fundações</b> primeiro: elas nivelam e dá pra <b>subir de 0,5 em 0,5 m</b> com <kbd>R</kbd> enquanto segura a fundação.</li>
<li>Construir em cima de plantas tira as plantas (sem dar itens).</li>
</ul>
<h3>5. Máquinas: ligar e escolher a receita</h3>
<p>Aperte <b><kbd>E</kbd></b> numa máquina pra abrir o painel:</p>
<ul>
<li><b>⏻ Ligar</b>: ela trabalha sozinha enquanto tiver entrada, energia e espaço na saída.</li>
<li><b>Receita</b>: a fornalha pode fazer lingote de ferro, de cobre, aço…; a construtora faz placas, hastes, parafusos, fios, cabos, concreto…</li>
<li><b>Fluxo por minuto</b> (entrada e saída), <b>colocar itens</b> da mochila (+1, +10, tudo) e <b>tirar</b> a produção.</li>
<li><b>⬆ Mk2/Mk3</b>: melhora a máquina (2× e 4×) pagando itens.</li>
<li><b>Prédios grandes (3×3)</b>: Minerador, Fornalha, Construtora, Montadora, Laboratório, Geradores, Contêiner, Bancada e Central. As esteiras encostam no <b>meio de cada lado</b> (setas no chão mostram entrada azul e saída laranja).</li>
<li>Trabalhando, as máquinas ganham vida: a broca gira e desce, a prensa bate, o braço da montadora gira, o núcleo do laboratório pulsa, e o painel solar vira pro sol.</li>
</ul>
<table><tr><th>Máquina</th><th>O que faz</th></tr><tr><td>⛏️ Minerador</td><td>3×3, com o meio em cima de um veio: tira minério e solta na seta laranja</td></tr><tr><td>🔥 Fornalha</td><td>Minério → lingote (aço precisa de ferro + carvão)</td></tr><tr><td>🏭 Construtora</td><td>1 entrada → peças (placa, haste, parafuso, fio, cabo, concreto, biomassa)</td></tr><tr><td>🛠️ Montadora</td><td>2 entradas → peças complexas (placa reforçada, rotor, estrutura modular…)</td></tr><tr><td>🔥 Gerador de Biomassa / a Carvão / ☀️ Painel Solar</td><td>Energia ⚡ (o de biomassa queima biomassa, madeira, folhas, fibra ou esporos: a boca de fogo acende e a chaminé solta fumaça)</td></tr><tr><td>📦 Contêiner</td><td>Guarda 24 pilhas de itens</td></tr><tr><td>🔬 Laboratório</td><td>Pesquisas (mochila maior, coletor mais rápido, turbo, Mk2/Mk3…)</td></tr><tr><td>🚀 Plataforma</td><td>Projeto Foguete em fases</td></tr></table>
<h3>6. Energia ⚡</h3>
<p>Tudo que tem ⚡ precisa de <b>cabo 🔌</b> até um gerador. Clique na máquina com o cabo selecionado e depois no gerador (ou num <b>poste</b> no meio do caminho). O <b>Gerador de Biomassa</b> queima biomassa, madeira, folhas ou fibra; ele só gasta combustível quando alguém está usando energia.</p>
<h3>7. Logística (esteiras)</h3>
<ul>
<li><b>Esteiras Mk1 a Mk5</b>: 60, 120, 270, 480 e 780 itens/min. A faixa na lateral mostra o Mk: prata, azul, rosa, dourada e verde.</li>
<li><b>Caminho de esteiras</b> (igual Satisfactory): com a esteira na mão, <b>clique no começo</b> e <b>clique no fim</b>: aparece a prévia do caminho inteiro (em L) e o custo total; o segundo clique constrói tudo. <b><kbd>R</kbd></b> troca o lado da curva, <b>botão direito</b> (ou <kbd>Q</kbd>) cancela. Comece mirando numa <b>máquina ou esteira</b> pra encaixar na saída dela; mire numa máquina no fim e o caminho para na frente dela, entrando nela. Passar por cima de uma esteira de outro Mk troca ela.</li>
<li><b>Divisor</b>: 1 entrada → até 3 saídas. <b>Juntador</b>: até 3 entradas → 1 saída (é assim que você junta vários minérios numa esteira só).</li>
<li><b>Separador</b>: filtros por item (esquerda, direita, frente).</li>
<li><b>Esteira alta</b> e <b>rampas</b> passam por cima de outras esteiras.</li>
<li>Itens <b>sobem e descem rampas</b> do terreno sozinhos.</li>
</ul>
<h3>8. Código: turbinar com Jiboia</h3>
<p>Depois do Marco 🖥️ <b>Automação</b>, monte um <b>Computador</b> e programe (tecla <kbd>E</kbd> nele). Exemplo:</p>
${code('f = maquina("fornalha1")\nenquanto Verdadeiro:\n    se inventario("lingote_ferro") < 200:\n        f.turbo(2)          # 2× mais rápido por 10 s\n    esperar(8)')}
<ul>
<li><kbd>m.turbo(k)</kbd> acelera por 10 s e a energia sobe k^1,6 — o computador precisa <b>ficar mandando</b>.</li>
<li><code>m.receita("...")</code>, <kbd>m.ligar()</kbd>, <kbd>m.desligar()</kbd>, sensores, rede entre computadores… tudo no <b>manual</b> (aba Manual do editor).</li>
</ul>
<h3>9. O céu de KX-7 🪐</h3>
<p>Um dia dura <b>16 minutos</b>. O sol nasce no leste e faz um arco.</p>
<ul>
<li><b>Júpiter</b> muda de tamanho: a cada <b>8 dias</b> KX-7 passa por ele (<b>oposição</b>) e ele fica enorme a noite toda. A órbita dele é oval: uma em cada três oposições é a <b>Grande Aproximação</b>, ainda maior.</li>
<li>Duas luas: <b>Mira</b> (grande, 5 dias) e <b>Pip</b> (pequena e rápida), com fases.</li>
<li>A cada 10 dias, ao meio-dia, Mira passa na frente do sol: <b>eclipse</b> 🌑.</li>
<li>Passe o mouse na <b>linha do céu</b> (embaixo do relógio) pra ver o almanaque.</li>
</ul>
<h3>10. Eventos naturais (efeitos leves e bons)</h3>
<table><tr><th>Evento</th><th>Quando</th><th>Efeito</th></tr><tr><td>🪐 Júpiter perto</td><td>perto da oposição</td><td>Mineradores de Cristal KX e Quartzo +25% (+50% na Grande Aproximação)</td></tr><tr><td>🌌 Aurora</td><td>à noite, mais na tundra e com Júpiter perto</td><td>Painéis solares rendem um pouco à noite</td></tr><tr><td>🌿 Floração luminosa</td><td>à noite</td><td>Plantas rendem o dobro, flora brilha, Luminita +30%</td></tr><tr><td>🌑 Eclipse</td><td>ao meio-dia, a cada 10 dias</td><td>A flora acende e a Luminita rende o dobro</td></tr><tr><td>☄️ Chuva de meteoros</td><td>à noite</td><td>Uns caem perto de você: veio de meteorito (Fragmento Estelar) e pedrinhas pra pegar com <kbd>E</kbd></td></tr><tr><td>☄️ Cometa</td><td>às vezes, por 2 noites</td><td>Só pra olhar 😊</td></tr><tr><td>🌧️❄️🌪️ Tempo ruim</td><td>qualquer hora</td><td>Chuva na floresta/pântano, neve na tundra, tempestade de areia no cânion; arco-íris depois da chuva</td></tr></table>
<h3>11. Mapa (<kbd>Tab</kbd>)</h3>
<p>Relevo com as cores dos biomas, <b>só o que você já explorou</b> (de cima de um morro você enxerga mais longe), veios por pureza (bolinha grande com borda = puro), sua fábrica, cabos e jogadores. <b>Botão direito</b> põe/tira marcadores, roda do mouse dá zoom, <kbd>C</kbd> centraliza.</p>
<h3>12. Jogar junto (<kbd>O</kbd>)</h3>
<p>Um cria a sala e passa o código de 5 letras. Os PCs se ligam <b>direto pela internet</b>, sem servidor pra instalar. Quem entra <b>baixa o planeta do anfitrião</b> (mesma semente) e constrói na mesma fábrica. O inventário é um só, o do anfitrião, e só ele salva. Se a sua rede bloquear a conexão direta, tente outra rede (por exemplo, o 4G do celular).</p>
<h3>13. Pausa (<kbd>Esc</kbd>)</h3>
<p>A pausa é um arquivo <kbd>menu.jib</kbd>: cada opção é uma linha (<kbd>continuar()</kbd>, <kbd>salvar()</kbd>, <kbd>mapa()</kbd>, <code>configuracoes()</code>…). Na versão para Windows (.exe) tem também <kbd>sair_do_jogo()</kbd> (salva e fecha) e, em configurações, <kbd>tela_cheia()</kbd> (ou <kbd>F11</kbd>). Use ↑↓ e Enter, o mouse, ou <kbd>Esc</kbd> pra voltar. O terminal embaixo mostra save, fps, jogadores, tier e o céu.</p>
<h3>Atalhos</h3>
<table><tr><th>Tecla</th><th>Ação</th></tr><tr><td><kbd>WASD</kbd> · <kbd>Shift</kbd> · <kbd>Espaço</kbd> · <kbd>Ctrl</kbd></td><td>Andar · correr · pular · deslizar</td></tr><tr><td><kbd>E</kbd> (segurar)</td><td>Coletar / usar</td></tr><tr><td><kbd>1</kbd>–<kbd>9</kbd></td><td>Barra de construção</td></tr><tr><td><kbd>B</kbd></td><td>Menu de construção</td></tr><tr><td><kbd>R</kbd> · <kbd>X</kbd> · <kbd>Q</kbd></td><td>Girar · desmontar · soltar da mão</td></tr><tr><td><kbd>C</kbd> · <kbd>V</kbd></td><td>Copiar · colar grupo</td></tr><tr><td><kbd>Tab</kbd> · <kbd>H</kbd> · <kbd>K</kbd> · <kbd>J</kbd></td><td>Mapa · guia · estatísticas · projetos</td></tr><tr><td><kbd>P</kbd></td><td>Modo foto</td></tr><tr><td><kbd>M</kbd></td><td>Pular pra próxima parte da música</td></tr><tr><td><kbd>O</kbd></td><td>Jogar junto</td></tr><tr><td><kbd>Esc</kbd></td><td>Pausa</td></tr></table>
<h3>Problemas comuns</h3>
<ul>
<li><b>Máquina parada?</b> Veja a luz: vermelha piscando = sem energia (cabo!); amarela = esperando entrada ou saída cheia; cinza = desligada (⏻ no painel).</li>
<li><b>"Terreno muito inclinado"</b> → ponha fundações.</li>
<li><b>Mochila cheia</b> → guarde num Contêiner ou construa algo.</li>
<li><b>Jogo pesado?</b> Configurações → Qualidade <b>Média</b> ou <b>Baixa</b> (desliga o bloom e diminui a flora distante).</li>
</ul>
</div>`;
}
