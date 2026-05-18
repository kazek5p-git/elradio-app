export type MessageType = 'general' | 'greetings' | 'song' | 'city' | 'technical';

export type FeedbackKind = 'bug' | 'suggestion';

export type MessageTypeOption = {
  id: MessageType;
  label: string;
  subject: string;
  placeholder: string;
};

export const MESSAGE_TYPE_OPTIONS: MessageTypeOption[] = [
  {
    id: 'general',
    label: 'Ogólna',
    subject: 'Wiadomość z aplikacji EL Radio',
    placeholder: 'Wpisz swoją wiadomość',
  },
  {
    id: 'greetings',
    label: 'Pozdrowienia',
    subject: 'Pozdrowienia z aplikacji EL Radio',
    placeholder: 'Napisz, kogo chcesz pozdrowić',
  },
  {
    id: 'song',
    label: 'Utwór',
    subject: 'Prośba o utwór z aplikacji EL Radio',
    placeholder: 'Podaj wykonawcę, tytuł utworu i ewentualnie dedykację',
  },
  {
    id: 'city',
    label: 'Info z miasta',
    subject: 'Informacja z Łodzi z aplikacji EL Radio',
    placeholder: 'Napisz krótką informację z miasta',
  },
  {
    id: 'technical',
    label: 'Techniczna',
    subject: 'Wiadomość techniczna z aplikacji EL Radio',
    placeholder: 'Opisz sprawę techniczną',
  },
];

export function getMessageTypeOption(messageType: MessageType) {
  return MESSAGE_TYPE_OPTIONS.find((option) => option.id === messageType) ?? MESSAGE_TYPE_OPTIONS[0];
}

export const FEEDBACK_COPY: Record<FeedbackKind, {
  title: string;
  messageLabel: string;
  placeholder: string;
  subject: string;
}> = {
  bug: {
    title: 'Zgłoś błąd',
    messageLabel: 'Opis błędu',
    placeholder: 'Opisz, co nie działa i co robiłeś przed wystąpieniem problemu.',
    subject: 'Błąd w aplikacji El Radio',
  },
  suggestion: {
    title: 'Wyślij propozycję',
    messageLabel: 'Treść propozycji',
    placeholder: 'Napisz, co warto dodać albo zmienić w aplikacji.',
    subject: 'Propozycja do aplikacji El Radio',
  },
};

export function getFeedbackCopy(kind: FeedbackKind) {
  return FEEDBACK_COPY[kind];
}
