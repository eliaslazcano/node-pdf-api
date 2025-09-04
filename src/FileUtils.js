const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

/**
 * Gera um path (caminho completo) para ser usado para criar arquivo temporario, esta função só gera o caminho, não o arquivo.
 * @param {string} nomeArquivo
 * @return {string}
 */
const gerarPathTemporario = (nomeArquivo) => {
  const tmpDir = path.join(__dirname, '../temp'); // Diretório temporário
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
 * Converte um número (representando bytes) para uma string legível.
 * @param {number} bytes
 * @param {boolean} binary
 * @return {string}
 */
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

const getFileName = (filePath) => {
  const parts = filePath.split('/');
  return parts[parts.length - 1];
};

module.exports = {gerarPathTemporario, gerarArquivoTemporario, tamanhoHumanizado, getFileName}