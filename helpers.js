const {rgb} = require('pdf-lib');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pdftk = require('node-pdftk');

const responderErro = (res, httpCode = 400, mensagem = '', errorId = 1, extra = {}) => {
  return res.status(httpCode).json({http: httpCode, mensagem, erro: errorId, dados: extra});
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

/**
 * Gera um path (caminho completo) para ser usado para criar arquivo temporario, esta função só gera o caminho, não o arquivo.
 * @param {string} nomeArquivo
 * @return {string}
 */
const gerarPathTemporario = (nomeArquivo) => {
  const tmpDir = path.join(__dirname, './temp'); // Diretório temporário
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir); // Certifica-se de que o diretório temporário exista
  return path.normalize(`${tmpDir}/${nomeArquivo}`);
};

/**
 * Cria um arquivo temporario, retornando seu local. Lembre-se de usar fs.unlink() para excluir depois.
 * @param {string | Buffer | TypedArray | DataView} data
 * @param {string} sufixo
 * @return {string}
 */
const gerarArquivoTemporario = (data, sufixo = '.pdf') => {
  const uniqueId = crypto.randomBytes(16).toString('hex');
  const tmpFilePath = gerarPathTemporario(`${uniqueId}${sufixo}`);
  fs.writeFileSync(tmpFilePath, data); // Escreve os dados no arquivo temporário
  return tmpFilePath;
};

/**
 * Comprime um arquivo PDF usando o PDFTK. (Uma leve compressão nativa do algoritmo da Adobe).
 * @param {string} filepath Caminho completo para o arquivo de origem, incluindo o nome.
 * @param {string} output Caminho completo para o arquivo de saída, incluindo o nome.
 * @return {Promise<Buffer>}
 */
const comprimirComPdftk = (filepath, output) => {
  return pdftk.input(filepath).compress().output(output);
}

module.exports = {tamanhoHumanizado, responderErro, escreverPaginacao, gerarPathTemporario, gerarArquivoTemporario, comprimirComPdftk};