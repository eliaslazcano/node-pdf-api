const {rgb, PDFPage, PDFImage} = require('pdf-lib');
const {tamanhoHumanizado} = require('./FileUtils');
const pdftk = require('node-pdftk');
const gs = require('ghostscript-node');

/**
 * Insere uma imagem no documento PDF, criando uma página apenas com a imagem.
 * @param {PDFDocument} PDFDocument Instancia de PDFDocument.
 * @param {'image/jpeg'|'image/png'} contentType Tipo da imagem.
 * @param {Buffer<ArrayBuffer>} buffer Imagem a ser inserida no documento, carregada em formato ArrayBuffer.
 * @return {Promise<PDFPage>}
 */
const inserirImagem = async (PDFDocument, contentType, buffer) => {
  const img = (contentType === 'image/jpeg') ? await PDFDocument.embedJpg(buffer) : await PDFDocument.embedPng(buffer);
  const newPage = PDFDocument.addPage();
  const {width, height} = newPage.getSize();
  const scale = Math.min(width / img.width, height / img.height);
  const x = (width - (img.width * scale)) / 2;
  const y = (height - (img.height * scale)) / 2;
  newPage.drawImage(img, {x, y, width: img.width * scale, height: img.height * scale});
  return newPage;
}

/**
 * Escreve no documento, deixando visível o número da página de acordo com os parametros informados.
 * @param {PDFPage} PDFPage Instancia de PDFPage.
 * @param {number|string} nrPagina Número para escrever na página.
 */
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

/**
 * Aplica um desenho de carimbo.
 * @param {PDFPage} PDFPage Instancia de PDFPage.
 * @param {PDFImage|null} carimboImagem Imagem do carimbo.
 * @param {string} texto Texto a ser exibido no carimbo.
 */
const carimbarPagina = (PDFPage, carimboImagem, texto = '') => {
  PDFPage.drawImage(carimboImagem, {
    x: PDFPage.getWidth() - 110,
    y: PDFPage.getHeight() - 128,
    width: 60,
    height: 60,
  });

  if (texto) {
    PDFPage.drawRectangle({
      x: PDFPage.getWidth() - 110 + 10, //width do carimbo (60), ocupando 40 com o retangulo, sobra 20 que divide 10 pra cada lado. Por isso o nr 10
      y: PDFPage.getHeight() - 128 + 30 - 6, //30 = metade da altura do PNG, 6 = metade da altura do retangulo
      width: 40,
      height: 12,
      borderWidth: 0,
      borderColor: rgb(0.7, 0.7, 0.7),
      color: rgb(1, 1, 1),
      opacity: 1,
      borderOpacity: 1
    });

    PDFPage.drawText(texto, {
      x: PDFPage.getWidth() - 75 - (texto.length * 3), //0chars = -75, 1chars = -78, 2chars = -81, 3chars = -84, 4chars = -87, 5chars = -90, 6chars = -93, 7chars = -96
      y: PDFPage.getHeight() - 128 + 30 - 4,
      size: 11,
      color: rgb(0, 0, 0)
    });
  }
};

/**
 * Comprime um arquivo PDF usando o Ghostscript.
 * @param {Buffer<ArrayBuffer>} buffer Arquivo PDF a ser comprimido, carregado em formato ArrayBuffer.
 * @param {number} processId Apenas para log.
 * @return {Promise<Buffer<ArrayBuffer>>}
 */
const compressaoGhostscript = async (buffer, processId) => {
  console.log(`Processo ${processId}: Iniciando compressão do PDF.`);
  console.time(`Processo ${processId}: Tempo para comprimir o PDF`);
  try {
    const bufferComprimido = await gs.compressPDF(buffer);
    console.log(`Processo ${processId}: Tamanho pré-compressão: ` + tamanhoHumanizado(buffer.byteLength) + '; Tamanho pós-compressão: ' + tamanhoHumanizado(bufferComprimido.byteLength) + '. Reduzido ' + tamanhoHumanizado(buffer.byteLength - bufferComprimido.byteLength) + '.');
    if (bufferComprimido.byteLength < buffer.byteLength) buffer = bufferComprimido;
    else console.log(`Processo ${processId}: A compressão não reduziu o tamanho. Será usado o documento sem compressão.`);
  } catch (e) {
    console.log(e);
    console.log(`Processo ${processId}: A compressão falhou. Será usado o documento sem compressão.`);
  } finally {
    console.timeEnd(`Processo ${processId}: Tempo para comprimir o PDF`);
  }
  return buffer;
};

/**
 * Comprime um arquivo PDF usando o PDFTK. (Uma leve compressão nativa do algoritmo da Adobe).
 * @param {string} filepath Caminho completo para o arquivo de origem, incluindo o nome.
 * @param {string} output Caminho completo para o arquivo de saída, incluindo o nome.
 * @return {Promise<Buffer>}
 */
const comprimirComPdftk = (filepath, output) => {
  return pdftk.input(filepath).compress().output(output);
};

module.exports = {inserirImagem, escreverPaginacao, carimbarPagina, compressaoGhostscript};