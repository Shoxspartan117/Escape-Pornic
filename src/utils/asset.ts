/** Préfixe les chemins publics absolus ("/icons/x.png") avec la base de déploiement (ex. GitHub Pages). */
export function asset(path: string): string {
  if (!path.startsWith('/') || path.startsWith('//')) return path;
  return import.meta.env.BASE_URL.replace(/\/$/, '') + path;
}
