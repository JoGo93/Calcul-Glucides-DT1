# Version 3.2.0

- Ajout du champ « Nombre de portions (optionnel) » pour les recettes maison.
- Calcul automatique des glucides nets par portion.
- Affichage des glucides par portion dans le créateur, la fiche du Registre et le Calculateur.
- Ajout de la mention « Sur l’étiquette des valeurs nutritives » dans Produit emballé.
- Calcul automatique du poids final à partir des ingrédients, avec modification manuelle possible.

# Version 3.1.4

- Correction du chargement de la base complète dans la PWA iPhone.
- Le dépassement de quota localStorage ne déclenche plus la base minimale.
- Le service worker met en cache database.json avec une clé stable et évite les copies multiples.

# Version 3.1.3

- Correction définitive de l’affichage des photos dans le Registre.
- Les images des aliments et produits sont maintenant intégrées directement dans `database.json`.
- Nouvelle clé de cache afin de forcer le rechargement de la base.

# Changelog

## 3.1.2
- Intégration réelle et vérifiée des produits de marque envoyés avec photos.
- Ajout des photos officielles pour les aliments génériques fournis.
- Correction des bleuets à 10,0 g/100 g; ajout de mûres et pomme sans pelure.
- Ajout de Crêpes banane et fromage cottage et Macaronis chinois au bœuf.
- Nouveau cache de base centrale pour forcer le chargement de database.json.
