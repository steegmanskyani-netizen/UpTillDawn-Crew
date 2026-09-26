export type ExtendedUiLocale = 'nl' | 'fr' | 'en' | 'de'

type Row = { fr: string; en: string; de: string }

const EXTENSIONS: Record<string, Row> = {
  'Importeer briefing': { fr: 'Importer le briefing', en: 'Import briefing', de: 'Briefing importieren' },
  'Importeer een bestaand briefingbestand. De titel en algemene instructies worden automatisch uitgelezen en ingevuld.': { fr: 'Importez un fichier de briefing existant. Le titre et les instructions générales sont lus et remplis automatiquement.', en: 'Import an existing briefing file. The title and general instructions are read and filled in automatically.', de: 'Importieren Sie eine vorhandene Briefing-Datei. Titel und allgemeine Anweisungen werden automatisch ausgelesen und ausgefüllt.' },
  'PDF, DOCX, PPTX, XLSX, TXT, CSV, JPG, PNG of WEBP · maximaal 20 MB. Afbeeldingen in DOCX, PPTX en XLSX worden waar mogelijk automatisch als bijlage toegevoegd.': { fr: 'PDF, DOCX, PPTX, XLSX, TXT, CSV, JPG, PNG ou WEBP · 20 Mo maximum. Les images des fichiers DOCX, PPTX et XLSX sont ajoutées automatiquement comme pièces jointes lorsque cela est possible.', en: 'PDF, DOCX, PPTX, XLSX, TXT, CSV, JPG, PNG or WEBP · maximum 20 MB. Images in DOCX, PPTX and XLSX are automatically added as attachments where possible.', de: 'PDF, DOCX, PPTX, XLSX, TXT, CSV, JPG, PNG oder WEBP · maximal 20 MB. Bilder in DOCX-, PPTX- und XLSX-Dateien werden nach Möglichkeit automatisch als Anhänge hinzugefügt.' },
  'Bestand wordt gelezen…': { fr: 'Lecture du fichier…', en: 'Reading file…', de: 'Datei wird gelesen…' },
  'Analyse mislukt.': { fr: 'Échec de l’analyse.', en: 'Analysis failed.', de: 'Analyse fehlgeschlagen.' },
  'Titel en instructies zijn automatisch ingevuld. Controleer ze voor opslaan.': { fr: 'Le titre et les instructions ont été remplis automatiquement. Vérifiez-les avant d’enregistrer.', en: 'The title and instructions were filled in automatically. Check them before saving.', de: 'Titel und Anweisungen wurden automatisch ausgefüllt. Prüfen Sie sie vor dem Speichern.' },
  'Titel': { fr: 'Titre', en: 'Title', de: 'Titel' },
  'Foto’s of video’s': { fr: 'Photos ou vidéos', en: 'Photos or videos', de: 'Fotos oder Videos' },
  "Foto's of video's": { fr: 'Photos ou vidéos', en: 'Photos or videos', de: 'Fotos oder Videos' },
  'Maximaal 5 bestanden per instructie. Foto maximaal 10 MB, video maximaal 50 MB.': { fr: 'Maximum 5 fichiers par instruction. Photo : 10 Mo maximum, vidéo : 50 Mo maximum.', en: 'Maximum 5 files per instruction. Photo maximum 10 MB, video maximum 50 MB.', de: 'Maximal 5 Dateien pro Anweisung. Foto maximal 10 MB, Video maximal 50 MB.' },
  'Document openen': { fr: 'Ouvrir le document', en: 'Open document', de: 'Dokument öffnen' },
  'Media bij instructie': { fr: 'Média de l’instruction', en: 'Instruction media', de: 'Medien zur Anweisung' },
  'Taal wijzigen': { fr: 'Changer de langue', en: 'Change language', de: 'Sprache ändern' },
  'Taal': { fr: 'Langue', en: 'Language', de: 'Sprache' },
  'Nederlands': { fr: 'Néerlandais', en: 'Dutch', de: 'Niederländisch' },
  'Frans': { fr: 'Français', en: 'French', de: 'Französisch' },
  'Engels': { fr: 'Anglais', en: 'English', de: 'Englisch' },
  'Duits': { fr: 'Allemand', en: 'German', de: 'Deutsch' },
  'Overzicht': { fr: 'Aperçu', en: 'Overview', de: 'Übersicht' },
  'Evenementen': { fr: 'Événements', en: 'Events', de: 'Veranstaltungen' },
  'Werkuren': { fr: 'Heures de travail', en: 'Work hours', de: 'Arbeitszeiten' },
  'Mijn werkuren': { fr: 'Mes heures de travail', en: 'My work hours', de: 'Meine Arbeitszeiten' },
  'Diensten': { fr: 'Services', en: 'Shifts', de: 'Schichten' },
  "Shift's": { fr: 'Services', en: 'Shifts', de: 'Schichten' },
  'Werkplekken': { fr: 'Postes de travail', en: 'Workplaces', de: 'Arbeitsplätze' },
  'Taken': { fr: 'Tâches', en: 'Tasks', de: 'Aufgaben' },
  'Briefing': { fr: 'Briefing', en: 'Briefing', de: 'Briefing' },
  'Instructies': { fr: 'Instructions', en: 'Instructions', de: 'Anweisungen' },
  'Personeel & goedkeuringen': { fr: 'Personnel et validations', en: 'Staff & approvals', de: 'Personal & Genehmigungen' },
  'Personeel': { fr: 'Personnel', en: 'Staff', de: 'Personal' },
  "Chat's": { fr: 'Discussions', en: 'Chats', de: 'Chats' },
  'Help': { fr: 'Aide', en: 'Help', de: 'Hilfe' },
  'Instellingen': { fr: 'Paramètres', en: 'Settings', de: 'Einstellungen' },
  'Meldingen': { fr: 'Notifications', en: 'Notifications', de: 'Benachrichtigungen' },
  'Profiel': { fr: 'Profil', en: 'Profile', de: 'Profil' },
  'Uitloggen': { fr: 'Se déconnecter', en: 'Log out', de: 'Abmelden' },
  'Nieuwe algemene instructie': { fr: 'Nouvelle instruction générale', en: 'New general instruction', de: 'Neue allgemeine Anweisung' },
  'Persoonlijke instructie': { fr: 'Instruction personnelle', en: 'Personal instruction', de: 'Persönliche Anweisung' },
  'Algemene instructie': { fr: 'Instruction générale', en: 'General instruction', de: 'Allgemeine Anweisung' },
  'Instructie aanmaken': { fr: 'Créer l’instruction', en: 'Create instruction', de: 'Anweisung erstellen' },
  'Instructie toewijzen': { fr: 'Attribuer l’instruction', en: 'Assign instruction', de: 'Anweisung zuweisen' },
  'Geheel evenement': { fr: 'Événement entier', en: 'Entire event', de: 'Gesamte Veranstaltung' },
  'Evenement…': { fr: 'Événement…', en: 'Event…', de: 'Veranstaltung…' },
  'Personeelslid…': { fr: 'Membre du personnel…', en: 'Staff member…', de: 'Mitarbeiter…' },
}

export function translateUiExtension(value: string, locale: ExtendedUiLocale) {
  if (locale === 'nl') return value
  const row = EXTENSIONS[value]
  return row?.[locale] || value
}
