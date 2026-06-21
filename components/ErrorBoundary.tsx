"use client";

import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Ação opcional de recuperação (ex.: limpar o projeto problemático). */
  onReset?: () => void;
}
interface State {
  erro: Error | null;
}

// Evita que um projeto salvo corrompido (schema antigo) derrube a tela inteira
// com "Application error: a client-side exception has occurred". Em vez de tela
// preta, mostra um aviso recuperável.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { erro: null };

  static getDerivedStateFromError(erro: Error): State {
    return { erro };
  }

  reset = () => {
    this.props.onReset?.();
    this.setState({ erro: null });
  };

  render() {
    if (this.state.erro) {
      return (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-5 text-center">
          <div className="font-display text-sm font-bold uppercase tracking-wider text-red-400">
            Algo quebrou ao montar esta tela
          </div>
          <p className="mt-2 text-sm text-zinc-400">
            Isso costuma acontecer com um projeto salvo em formato antigo. Você pode tentar
            recarregar começando um projeto novo — seus outros projetos continuam salvos.
          </p>
          <p className="mt-2 break-words text-[11px] text-zinc-600">{this.state.erro.message}</p>
          <button
            onClick={this.reset}
            className="mt-4 rounded-xl bg-amber px-5 py-2.5 font-display text-sm font-bold uppercase tracking-wider text-ink-900 active:scale-95"
          >
            Recomeçar projeto novo
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
