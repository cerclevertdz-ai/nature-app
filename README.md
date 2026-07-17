# Moi j'aime mon pays — شوف أنا نحب الطبيعة

Concours écologique bilingue FR/AR — "Écologiste du mois".

## Identifiants admin par défaut
- **Pseudo :** admin
- **Mot de passe :** admin123
- **⚠️ Changer le mot de passe** immédiatement après la première connexion via Admin > ⚙️ Paramètres

## Installation

```bash
npm install
npm start
```

L'app tourne sur http://localhost:3000

## Variable d'environnement (optionnel mais recommandé)

```
SESSION_SECRET=une_chaine_aleatoire_longue_et_secrete
PORT=3000
```

## Hébergement recommandé (gratuit)

### Railway.app
1. Crée un compte sur railway.app
2. "New Project" → "Deploy from GitHub" ou "Deploy from local"
3. Ajoute la variable SESSION_SECRET dans les paramètres
4. Deploy → tu obtiens un lien public

### Render.com
1. Crée un compte sur render.com
2. "New Web Service" → connecte ton dépôt ou upload les fichiers
3. Build Command : `npm install`
4. Start Command : `node server.js`
5. Ajoute SESSION_SECRET dans Environment Variables

### VPS (Ubuntu)
```bash
# Installer Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Lancer l'app
npm install
SESSION_SECRET=ton_secret node server.js

# Ou avec PM2 pour qu'elle tourne en continu
npm install -g pm2
pm2 start server.js --name "nature-app"
pm2 startup
```

## Structure des fichiers

```
├── server.js          # Serveur Express (API + static)
├── package.json
├── data/              # Base de données SQLite (créée automatiquement)
├── public/
│   ├── index.html     # App principale
│   ├── admin.html     # Panneau admin
│   ├── css/style.css
│   ├── js/app.js
│   ├── img/cerf.png
│   └── uploads/       # Photos uploadées (créé automatiquement)
```

## Protections anti-triche intégrées
- 1 seule publication par mois par utilisateur (vérification serveur)
- Email unique par compte
- Rate limiting : 3 inscriptions/heure/IP, 8 logins/15min/IP, 20 votes/heure/IP
- Session secret fixe (les sessions survivent aux redémarrages)
- IP enregistrée à l'inscription — visible dans Admin > Utilisateurs
- Alerte si plusieurs comptes depuis la même IP
