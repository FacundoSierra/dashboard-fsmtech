export interface EstadoCaptura {
  error?: string;
  /** Lo que se había escrito, para no perderlo si hay un error */
  texto?: string;
  tipo?: string;
  relacionada?: string;
}
