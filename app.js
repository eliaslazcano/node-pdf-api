const express = require('express');
const multer = require('multer');
const axios = require('axios');
const gs = require('ghostscript-node');
const { PDFDocument } = require('pdf-lib');
const { setMaxListeners } = require('events');
const { responderErro, tamanhoHumanizado, escreverPaginacao } = require('./helpers');
const { compressImage } = require('./imghelpers');

const LIMIT_MERGE_DOCUMENTS = 132; //quantidade de arquivos que podem caber no juntador (por arquivo, nao por pagina).
const LIMIT_MERGE_SIZE = 104857600; //limite em bytes do tamanho total dos arquivos que podem caber no juntador (antes da junção).
const LIMIT_COMPRESS_SIZE = 96468992; //limite em bytes do tamanho do arquivo que pode passar pelo compressor. acima do limite o arquivo não será comprimido
const LIMIT_COMPRESS_PAGES = 198; //limite de páginas que pode passar pelo compressor. acima do limite o arquivo não será comprimido

const app = express();
app.use(express.json()); //Habilita o interpretador de JSON do Express, caso contrario ele nao saberia o que é JSON.

const porta = process.env.PORT || 3000;
app.listen(porta, () => console.log(`SERVIDOR LIGADO. PORTA: ${porta}.`));

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
  if (urls.length > LIMIT_MERGE_DOCUMENTS) return responderErro(res, 400, `Não é possível juntar uma quantia enorme de documentos. Limite máximo de ${LIMIT_MERGE_DOCUMENTS}. Você tentou juntar ${urls.length}.`);
  console.log(`Processo ${processId}: Inicio do processo! (Juntador de arquivos).`);
  console.log(`Processo ${processId}: Ordem para juntar ${urls.length} URLs. Baixando arquivos para o servidor..`);

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
  if (tamanhoTotal > LIMIT_MERGE_SIZE) return responderErro(res, 400, `Você ultrapassou o limite de segurança de ${tamanhoHumanizado(LIMIT_MERGE_SIZE)}. O arquivo é muito grande para ser combinado. Tente comprimi-lo antes ou reduza a quantidade de arquivos. Os softwares de leitura podem apresentar problemas com este tamanho exagerado e as atividades dos outros usuários podem sofrer interrupções por sobrecarga na rede.`, 7);

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
        else paginaAtual++;
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
      else paginaAtual++;
    }
  }
  const pdfSaved = await pdfDoc.save();
  console.timeEnd(`Processo ${processId}: Tempo para construir documento juntado.`);
  console.log(`Processo ${processId}: O arquivo juntado ficou com ${paginaAtual} páginas. ${tamanhoHumanizado(pdfSaved.byteLength)}.`);

  let buffer = Buffer.from(pdfSaved);
  if (req.body.comprimir) {
    if (buffer.byteLength > LIMIT_COMPRESS_SIZE) {
      console.log(`Processo ${processId}: A compressão não será realizada porque o arquivo excede ${tamanhoHumanizado(LIMIT_COMPRESS_SIZE)}, levaria tempo demais para comprimir. (Tamanho: ${tamanhoHumanizado(buffer.byteLength)}).`);
    } else if (paginaAtual > LIMIT_COMPRESS_PAGES) {
      console.log(`Processo ${processId}: A compressão não será realizada porque o arquivo tem páginas demais (${paginaAtual}), levaria tempo demais para comprimir. Limite máximo de ${LIMIT_COMPRESS_PAGES}.`);
    } else {
      console.log(`Processo ${processId}: Iniciando compressão do PDF.`);
      console.time(`Processo ${processId}: Tempo para comprimir o PDF.`);
      try {
        const bufferComprimido = await gs.compressPDF(buffer);
        console.log(`Processo ${processId}: Tamanho pré-compressão: ` + tamanhoHumanizado(buffer.byteLength) + '; Tamanho pós-compressão: ' + tamanhoHumanizado(bufferComprimido.byteLength) + '. Reduzido ' + tamanhoHumanizado(buffer.byteLength - bufferComprimido.byteLength) + '.');
        if (bufferComprimido.byteLength < buffer.byteLength) buffer = bufferComprimido;
        else console.log(`Processo ${processId}: A compressão não reduziu o tamanho. Será usado o documento sem compressão.`);
      } catch (e) {
        console.log(`Processo ${processId}: A compressão falhou. Será usado o documento sem compressão.`);
      } finally {
        console.timeEnd(`Processo ${processId}: Tempo para comprimir o PDF.`);
      }
    }
  }

  const nomeArquivo = req.body.nome ? req.body.nome : 'documento_juntado.pdf';
  res.set('Content-Type', 'application/pdf');
  res.set('Content-Disposition', `inline; filename="${req.body.nome ? req.body.nome : 'documento_juntado.pdf'}"`);
  res.send(buffer);
  console.log(`Processo ${processId}: Arquivo enviado ao cliente com nome: ${nomeArquivo}.`);
  console.log(`Processo ${processId}: Fim do processo!`);
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

  const processId = Date.now();
  console.log(`Processo ${processId}: Inicio do processo! (Compressor de arquivo).`);

  let buffer = Buffer.from(arquivo.buffer);
  if (arquivo.size > LIMIT_COMPRESS_SIZE) {
    console.log(`Processo ${processId}: A compressão não será realizada porque o arquivo excede ${tamanhoHumanizado(LIMIT_COMPRESS_SIZE)}, levaria tempo demais para comprimir. (Tamanho: ${tamanhoHumanizado(arquivo.size)}).`);
  } else {
    const pdfDocumento = await PDFDocument.load(buffer);
    const pageCount = pdfDocumento.getPageCount();
    if (pageCount > LIMIT_COMPRESS_PAGES) {
      console.log(`Processo ${processId}: A compressão não será realizada porque o arquivo tem páginas demais (${pageCount}), levaria tempo demais para comprimir. Limite máximo de ${LIMIT_COMPRESS_PAGES}.`);
    } else {
      console.log(`Processo ${processId}: Iniciando compressão do PDF. O arquivo possui ${pageCount} páginas e ${tamanhoHumanizado(arquivo.size)}.`);
      console.time(`Processo ${processId}: Tempo para comprimir o PDF.`);
      try {
        const bufferComprimido = await gs.compressPDF(buffer);
        console.log(`Processo ${processId}: Tamanho pré-compressão: ` + tamanhoHumanizado(buffer.byteLength) + '; Tamanho pós-compressão: ' + tamanhoHumanizado(bufferComprimido.byteLength) + '. Reduzido ' + tamanhoHumanizado(buffer.byteLength - bufferComprimido.byteLength) + '.');
        if (bufferComprimido.byteLength < buffer.byteLength) buffer = bufferComprimido;
        else console.log(`Processo ${processId}: A compressão não reduziu o tamanho. Será usado o documento sem compressão.`);
      } catch (e) {
        console.log(`Processo ${processId}: A compressão falhou. Será usado o documento sem compressão.`);
      } finally {
        console.timeEnd(`Processo ${processId}: Tempo para comprimir o PDF.`);
      }
    }
  }

  res.set('Content-Type', 'application/pdf');
  res.set('Content-Disposition', `inline; filename="${arquivo.originalname ? 'comprimido_' + arquivo.originalname : 'arquivo_comprimido.pdf'}"`);
  res.send(buffer);
});

app.post('/comprimir-imagem', upload.any(), async (req, res) => {
  if (!req.files) return responderErro(res, 400, 'O arquivo não está contido na requisição.', 1);
  const arquivo = req.files[0];
  if (!arquivo.mimetype || (arquivo.mimetype !== 'image/jpeg' && arquivo.mimetype !== 'image/png')) return responderErro(res, 400, 'O tipo do arquivo não é compatível.', 2, {'type': arquivo.mimetype});
  console.log(`Gatilho na API de compressão de imagem. Iniciando.. Tamanho original ${tamanhoHumanizado(arquivo.size)}.`);
  res.set('Content-Type', arquivo.mimetype);
  if (arquivo.originalname) res.set('Content-Disposition', `inline; filename="${arquivo.originalname}"`);
  try {
    const buffer = await compressImage(arquivo.buffer, .94, 1920, 1920, arquivo.mimetype);
    console.log(`Compressão de imagem finalizada. Tamanho final ${tamanhoHumanizado(buffer.byteLength)}.`);
    res.send(buffer.byteLength < arquivo.size ? buffer : arquivo.buffer);
  } catch (e) {
    console.log('Compressão de imagem fracassada. Retornando a imagem original.')
    res.send(arquivo.buffer);
  }
});