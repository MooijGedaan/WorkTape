import { useTranslation } from 'react-i18next';
import { Field, Label, Description } from './catalyst/fieldset';
import { Select } from './catalyst/select';

const languages = [
  { code: 'en', name: 'English' },
  { code: 'nl', name: 'Nederlands' },
];

export function LanguageSelector() {
  const { i18n } = useTranslation();

  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLanguage = e.target.value;
    i18n.changeLanguage(newLanguage);
  };

  return (
    <Field>
      <Label>Language / Taal</Label>
      <Description>
        Choose your preferred language for the application.
      </Description>
      <Select
        value={i18n.language}
        onChange={handleLanguageChange}
        className="mt-2 max-w-xs"
      >
        {languages.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.name}
          </option>
        ))}
      </Select>
    </Field>
  );
}
