'use strict';

/**
 * ReadCache — Cache em memória leve, limitado e com coalescência de requisições
 * simultâneas para reduzir round-trips repetidos ao PostgreSQL remoto.
 *
 * Regras de segurança e consistência:
 *  - Desabilitado automaticamente em NODE_ENV === 'test' (a menos que bypassInTest: false),
 *    mantendo testes unitários e de integração 100% determinísticos.
 *  - Chaves de recursos por usuário devem sempre incluir o usuarioId autenticado (JWT).
 *  - Toda mutação correspondente deve invalidar explicitamente a chave ou o prefixo afetado.
 */
class ReadCache {
  constructor({ maxEntries = 300, bypassInTest = true } = {}) {
    this._maxEntries = maxEntries;
    this._bypassInTest = bypassInTest;
    this._entries = new Map();
    this._inFlight = new Map();
  }

  _ativo() {
    if (this._bypassInTest && process.env.NODE_ENV === 'test') return false;
    return true;
  }

  async obterOuCarregar(chave, ttlMs, carregador) {
    if (!this._ativo() || !ttlMs || ttlMs <= 0) {
      return carregador();
    }

    const agora = Date.now();
    const existente = this._entries.get(chave);
    if (existente && agora < existente.expiraEm) {
      return existente.valor;
    }

    if (this._inFlight.has(chave)) {
      return this._inFlight.get(chave);
    }

    const versaoInicio = existente ? existente.versao : 0;
    const promessa = Promise.resolve()
      .then(() => carregador())
      .then((valor) => {
        // Evita regravar valor antigo caso a chave tenha sido invalidada durante o carregamento
        const atual = this._entries.get(chave);
        if (!atual || atual.versao === versaoInicio) {
          this._salvar(chave, valor, Date.now() + ttlMs, versaoInicio);
        }
        return valor;
      })
      .finally(() => {
        if (this._inFlight.get(chave) === promessa) {
          this._inFlight.delete(chave);
        }
      });

    this._inFlight.set(chave, promessa);
    return promessa;
  }

  _salvar(chave, valor, expiraEm, versao) {
    if (this._entries.has(chave)) {
      this._entries.delete(chave);
    } else if (this._entries.size >= this._maxEntries) {
      const maisAntiga = this._entries.keys().next().value;
      if (maisAntiga !== undefined) {
        this._entries.delete(maisAntiga);
      }
    }
    this._entries.set(chave, { valor, expiraEm, versao });
  }

  invalidar(chave) {
    const existente = this._entries.get(chave);
    const proximaVersao = existente ? existente.versao + 1 : 1;
    // Marca versão invalidada (expiraEm = 0) para impedir race com in-flight antigo
    if (this._inFlight.has(chave)) {
      this._entries.set(chave, { valor: undefined, expiraEm: 0, versao: proximaVersao });
    } else {
      this._entries.delete(chave);
    }
  }

  invalidarPrefixo(prefixo) {
    for (const chave of Array.from(this._entries.keys())) {
      if (chave.startsWith(prefixo)) {
        this.invalidar(chave);
      }
    }
    for (const chave of Array.from(this._inFlight.keys())) {
      if (chave.startsWith(prefixo)) {
        this.invalidar(chave);
      }
    }
  }

  limpar() {
    this._entries.clear();
    this._inFlight.clear();
  }
}

module.exports = {
  ReadCache,
  readCache: new ReadCache(),
};
