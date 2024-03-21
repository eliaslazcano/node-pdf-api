const express = require('express');
const multer = require('multer');
const axios = require('axios');
const gs = require('ghostscript-node');
const { PDFDocument, rgb } = require('pdf-lib');
const { setMaxListeners } = require('events');

const app = express();
app.use(express.json()); //Habilita o interpretador de JSON do Express, caso contrario ele nao saberia o que é JSON.

const porta = process.env.PORT || 3000;
app.listen(porta, () => console.log(`SERVIDOR LIGADO. PORTA: ${porta}.`));

const responderErro = (res, httpCode = 400, mensagem = '', errorId = 1, extra = {}) => {
  return res.status(httpCode).json({http: httpCode, mensagem, erro: errorId, dados: extra});
};

const escreverPaginacao = (PDFPage, nrPagina) => {
  if (typeof nrPagina !== 'number') nrPagina = parseInt(nrPagina);
  PDFPage.drawRectangle({
    x: (PDFPage.getWidth() - 22) ,
    y: 3 ,
    width: 50,
    height: 12,
    borderWidth: 1,
    borderColor: rgb(0.7, 0.7, 0.7),
    color: rgb(1, 1, 1),
    opacity: 1,
    borderOpacity: 1
  });
  PDFPage.drawText(nrPagina.toString(), {
    x: (PDFPage.getWidth() - (nrPagina >= 100 ? 20 : (nrPagina >= 10 ? 18 : 14))),
    y: 5,
    size: 11,
    color: rgb(0, 0, 0)
  });
};

const tamanhoHumanizado = (bytes, binary = true) => {
  const base = binary ? 1024 : 1000;
  if (bytes < base) return `${bytes} B`;
  const prefix = ['K', 'M', 'G'];
  let unit = -1;
  while (Math.abs(bytes) >= base && unit < prefix.length - 1) {
    bytes /= base;
    ++unit;
  }
  return `${bytes.toFixed(1)} ${prefix[unit]}B`;
}

const upload = multer();

app.get('/', (req, res) => res.json('TESTE BEM SUCEDIDO'));

/**
 * Gera um arquivo PDF feito pela união de diversos arquivos que são passados via URL.
 * {
 *     "urls": [
 *         "https://www.crecixx.conselho.net.br/images/cadastro/arquivo_digital/87328038187/usuario/ABASTECIMENTO___65F7DBE3B406C.pdf",
 *         "https://img.freepik.com/fotos-gratis/uma-pintura-de-um-lago-de-montanha-com-uma-montanha-ao-fundo_188544-9126.jpg",
 *         "https://fastly.picsum.photos/id/943/3840/2160.jpg?hmac=CHbObupokiUa7dZOWNfKXarM36qKzZzQVZlsRjeP1Wc",
 *         "https://www.crecixx.conselho.net.br/images/cadastro/arquivo_digital/87328038187/usuario/ANEXO_DA_DEFESA_DO_A_I____65F7E5F3DC20D.pdf"
 *     ],
 *     "paginacao": true,
 *     "comprimir": true,
 *     "nome": "ELIAS_NETO.pdf"
 * }
 */
app.post('/juntar-urls', async (req, res) => {
  const processId = Date.now();

  if (!req.is('json')) return responderErro(res, 400, `A requisição não é JSON.`, 1);
  if (!req.body.urls) return responderErro(res, 400, `O JSON enviado está incompleto, falta o parâmetro "urls" em formato Array.`, 2);
  if (!Array.isArray(req.body.urls)) return responderErro(res, 400, `O JSON enviado está incorreto, o parâmetro "urls" não está em formato Array, envie um Array de strings.`, 3);
  if (req.body.urls.length === 0) return responderErro(res, 400, `O JSON enviado está incorreto, o parâmetro "urls" está vazio.`, 4);

  /** @type {string[]} */
  const urls = req.body.urls.filter(i => !!i && typeof i === 'string');
  const naoPaginar = req.body.paginacao === false || req.body.paginacao === null;
  console.log(`Processo ${processId}: Ordem para juntar ${urls.length} URLs. Iniciando download.`);

  console.time(`Processo ${processId}: Tempo de download dos arquivos.`);
  let limiteTempoAtingido = false;
  const controller = new AbortController();
  setMaxListeners(100, controller.signal);
  const httpRequisicoes = urls.map(i => axios.get(i, {responseType: 'arraybuffer', signal: controller.signal}));
  const timeoutId = setTimeout(() => {
    limiteTempoAtingido = true;
    controller.abort();
  }, 60000);

  let httpRespostas = [];
  try {
    httpRespostas = await Promise.all(httpRequisicoes);
  } catch (e) {
    if (limiteTempoAtingido) return responderErro(res, 500, 'O download dos documentos para juntar está tomando tempo demais, seus documentos podem ser grandes demais para juntar. Operação cancelada por prevenção a sobrecarga. Tente comprimir o documento antes ou reduza a quantidade.', 5);
    return responderErro(res, 400, 'O download dos documentos falhou. Um de seus documentos pode estar corrompido (com defeito) ou ser grande demais para juntar.', 6);
  } finally {
    clearTimeout(timeoutId);
  }
  console.timeEnd(`Processo ${processId}: Tempo de download dos arquivos.`);

  const buffers = httpRespostas.map(i => i.data);
  const tamanhoTotal = buffers.reduce((carry, i) => carry + i.byteLength, 0);
  console.log(`Processo ${processId}: Tamanho total do download: ` + tamanhoHumanizado(tamanhoTotal) + '.');
  if (tamanhoTotal > 104857600) return responderErro(res, 400, 'Você ultrapassou o limite de segurança de 100MB. O arquivo é muito grande para ser combinado. Tente comprimi-lo antes ou reduza a quantidade de arquivos. Os softwares de leitura podem apresentar problemas com este tamanho exagerado e as atividades dos outros usuários podem sofrer interrupções por sobrecarga na rede.', 7);

  //A partir daqui começa a construção do documento juntado
  console.log(`Processo ${processId}: Começando a construir novo PDF.`);
  console.time(`Processo ${processId}: Tempo para construir documento juntado.`);
  const pdfDoc = await PDFDocument.create();
  let paginaAtual = 1;
  for (let i = 0; i < buffers.length; i++) {
    const contentType = httpRespostas[i].headers.get('content-type');
    if (contentType === 'application/pdf') {
      const pdfDocumento = await PDFDocument.load(buffers[i]);
      const pageCount = pdfDocumento.getPageCount();
      for (let a = 0; a < pageCount; a++) {
        const [existingPage] = await pdfDoc.copyPages(pdfDocumento, [a]);
        const page = pdfDoc.addPage(existingPage);
        if (!naoPaginar) escreverPaginacao(page, paginaAtual++);
      }
    }
    else if (contentType === 'image/jpeg' || contentType === 'image/png') {
      const img = (contentType === 'image/jpeg') ? await pdfDoc.embedJpg(buffers[i]) : await pdfDoc.embedPng(buffers[i]);
      const page = pdfDoc.addPage();
      const {width, height} = page.getSize();
      const scale = Math.min(width / img.width, height / img.height);
      const x = (width - (img.width * scale)) / 2;
      const y = (height - (img.height * scale)) / 2;
      page.drawImage(img, {x, y, width: img.width * scale, height: img.height * scale});
      if (!naoPaginar) escreverPaginacao(page, paginaAtual++);
    }
  }
  const pdfSaved = await pdfDoc.save();
  console.timeEnd(`Processo ${processId}: Tempo para construir documento juntado.`);
  console.log(`Processo ${processId}: O arquivo juntado ficou com ${paginaAtual} páginas.`);

  let buffer = Buffer.from(pdfSaved);
  if (req.body.comprimir) {
    try {
      if (buffer.byteLength > 67108864) {
        console.log(`Processo ${processId}: A compressão foi cancelada porque o arquivo excede 64MB, levaria tempo demais para comprimir. (Tamanho: ${tamanhoHumanizado(buffer.byteLength)}).`);
      } else if (paginaAtual > 192) {
        console.log(`Processo ${processId}: A compressão foi cancelada porque o arquivo tem páginas demais (${paginaAtual}), levaria tempo demais para comprimir.`);
      } else {
        console.log(`Processo ${processId}: Iniciando compressão do PDF.`);
        console.time(`Processo ${processId}: Tempo para comprimir o PDF.`);
        const bufferComprimido = await gs.compressPDF(buffer);
        console.timeEnd(`Processo ${processId}: Tempo para comprimir o PDF.`);
        console.log(`Processo ${processId}: Tamanho pré-compressão: ` + tamanhoHumanizado(buffer.byteLength) + '; Tamanho pós-compressão: ' + tamanhoHumanizado(bufferComprimido.byteLength) + '. Reduzido ' + tamanhoHumanizado(buffer.byteLength - bufferComprimido.byteLength) + '.');
        if (bufferComprimido.byteLength < buffer.byteLength) buffer = bufferComprimido;
        else console.log(`Processo ${processId}: A compressão não reduziu o tamanho. Será usado o documento sem compressão.`);
      }
    } catch (e) {
      console.timeEnd(`Processo ${processId}: Tempo para comprimir o PDF.`);
      console.log(`Processo ${processId}: A compressão falhou. Será usado o documento sem compressão.`);
    }
  }

  const nomeArquivo = req.body.nome ? req.body.nome : 'documento_juntado.pdf';
  res.set('Content-Type', 'application/pdf');
  res.set('Content-Disposition', `inline; filename="${req.body.nome ? req.body.nome : 'documento_juntado.pdf'}"`);
  res.send(buffer);
  console.log(`Processo ${processId}: Finalizado! Arquivo enviado ao cliente com nome: ${nomeArquivo}`);
});

/**
 * Gera um arquivo PDF feito pela união de diversos arquivos que são passados via FormData.
 */
app.post('/juntar-arquivos', upload.any(), async (req, res) => {
  if (!req.files) return responderErro(res, 400, 'Os arquivos não estão contidos na requisição.', 1);

  const buffers = req.files.map(i => i.buffer);
  const tamanhoTotal = buffers.reduce((carry, i) => carry + i.byteLength, 0);
  if (tamanhoTotal > 104857600) return responderErro(res, 400, 'Você ultrapassou o limite de segurança de 100MB. O arquivo é muito grande para ser combinado. Tente comprimi-lo antes ou reduza a quantidade de arquivos. Os softwares de leitura podem apresentar problemas com este tamanho exagerado e as atividades dos outros usuários podem sofrer interrupções por sobrecarga na rede.', 7);

  //A partir daqui começa a construção do documento juntado
  const pdfDoc = await PDFDocument.create();
  let paginaAtual = 1;
  for (let i = 0; i < buffers.length; i++) {
    const contentType = req.files[i].mimetype;
    if (contentType === 'application/pdf') {
      const pdfDocumento = await PDFDocument.load(buffers[i]);
      const pageCount = pdfDocumento.getPageCount();
      for (let a = 0; a < pageCount; a++) {
        const [existingPage] = await pdfDoc.copyPages(pdfDocumento, [a]);
        const page = pdfDoc.addPage(existingPage);
        escreverPaginacao(page, paginaAtual++);
      }
    }
    else if (contentType === 'image/jpeg' || contentType === 'image/png') {
      const img = (contentType === 'image/jpeg') ? await pdfDoc.embedJpg(buffers[i]) : await pdfDoc.embedPng(buffers[i]);
      const page = pdfDoc.addPage();
      const {width, height} = page.getSize();
      const scale = Math.min(width / img.width, height / img.height);
      const x = (width - (img.width * scale)) / 2;
      const y = (height - (img.height * scale)) / 2;
      page.drawImage(img, {x, y, width: img.width * scale, height: img.height * scale});
      escreverPaginacao(page, paginaAtual++);
    }
  }

  const pdfSaved = await pdfDoc.save();
  let buffer = Buffer.from(pdfSaved);

  try {
    const bufferComprimido = await gs.compressPDF(buffer);
    if (bufferComprimido.byteLength < buffer.byteLength) buffer = bufferComprimido;
  } catch (e) {
    console.log('A compressão falhou.');
  }

  res.set('Content-Type', 'application/pdf');
  res.set('Content-Disposition', `inline; filename="documento_juntado.pdf"`);
  res.send(buffer);
});

/**
 * Comprime um arquivo PDF enviado por FormData.
 * Não faz diferença qual "name" usar no FormData, caso envie vários arquivos apenas um será processado.
 */
app.post('/comprimir-arquivo', upload.any(), async (req, res) => {
  if (!req.files) return responderErro(res, 400, 'O arquivo não está contido na requisição.', 1);
  const arquivo = req.files[0];
  if (!arquivo.mimetype || arquivo.mimetype !== 'application/pdf') return responderErro(res, 400, 'O tipo do arquivo não é PDF.', 2, {'type': arquivo.mimetype});
  if (arquivo.size > 209715200) return responderErro(res, 400, 'O arquivo é grande demais para ser processado.', 3, {'bytes': arquivo.size});

  let buffer = Buffer.from(arquivo.buffer);
  try {
    const bufferComprimido = await gs.compressPDF(buffer);
    if (bufferComprimido.byteLength < buffer.byteLength) buffer = bufferComprimido;
  } catch (e) {
    console.log('A compressão falhou.');
  }

  res.set('Content-Type', 'application/pdf');
  res.set('Content-Disposition', `inline; filename="${arquivo.originalname ? 'comprimido_' + arquivo.originalname : 'arquivo_comprimido.pdf'}"`);
  res.send(buffer);
});