# Family constellation

A family tree you can fly through. Each person is a star with their photo; lines join parents to children and partners to each other. Select a star to read about that person and see their photos.

## Run it

```
npm install
npm run dev
```

Then open the address it prints. The page updates by itself when you change anything in `content/`.

## Add a person

1. Create `content/people/maria-silva.md`. The file name (lowercase letters, numbers and hyphens) is how other people refer to her.

   ```markdown
   ---
   name: Maria Silva
   born: 1938-04-12
   died: 2015
   birthplace: Porto
   parents: [joao-silva, ana-costa]
   spouses: [antonio-machado]
   portrait: portrait.jpg
   gallery:
     - file: wedding-1962.jpg
       caption: Wedding day, 1962
   ---

   Write anything you like about Maria here, in as many paragraphs as you want.
   ```

2. Put her photos in `content/photos/maria-silva/` (JPG, PNG, WebP, AVIF or SVG). They are resized automatically.

Only `name` is required. Some details:

- `born` and `died` accept `1938`, `1938-04` or `1938-04-12`.
- `nickname` (optional, e.g. `nickname: Hugo`) is the name this person goes by, when it is not their first name. The tree then shows it under their star, and the search finds them by it.
- `families` (optional, e.g. `families: [Machado]`) names the family sides that start with this person. Write it only on the oldest person of each side: their descendants belong to it automatically, and the site can then show one side at a time.
- `separated` (optional, e.g. `separated: [joao-silva]`) marks partners this person separated or divorced from; like `spouses`, it only needs to be written on one of the two. The line between them is then drawn broken.
- `godparents` (optional, e.g. `godparents: [rui-santos, ana-santos]`) names this person's padrinho and madrinha. Write it on the godchild only: the godparent's panel lists their afilhados by itself.
- A gallery photo can name the other people in it with `with: [ana-santos, rui-santos]`; it then also shows among their photos.
- `parents` and `spouses` list the file names of other people. You never list children: they follow from `parents`. A partner only needs to be written on one of the two people.
- The text below the second `---` is Markdown, so `*italics*`, links and headings work.

When you work with files: if something is wrong (a parent that does not exist, a photo that is missing), `npm run dev` and `npm run build` stop and name the file.

The 14 people in `content/people` now are made-up samples. Delete them and their folders in `content/photos` when you add your own family.

## Editing in the site

Select a person and use **Edit**, **Add a child**, **Add a partner**, **Add a parent**, **Add a brother or sister**, **Add a godparent** or **Add a godchild** at the bottom of their panel, or **Add a person** at the top left. Photos are shrunk in the browser before they are stored.

Without the online database (below) this is a trial: changes are kept in your browser only, and **Discard my changes** brings back the files.

## Let the family edit: the online database

The shared tree lives in a free [Supabase](https://supabase.com) project. Once it is connected, the database is the family tree; the files in `content/` are only the starting point.

1. Create an account and a new project at supabase.com.
2. In the project, open **SQL Editor**, paste everything from `supabase/setup.sql` and press **Run**.
3. Open **Project Settings > API**. Copy the project URL and the publishable (or `anon`) key.
4. Copy `.env.example` to `.env.local` and put those two values in it.
5. Run `npm run import` to copy the people and photos from `content/` into the database.
6. Run `npm run dev` (restart it if it was running). You are now editing the shared tree.

The two values must also be set where the site is published, as build settings with the same names.

Anyone who has the link to the site can change the tree. Two safety nets:

- Every change and deletion keeps the previous version in the `people_history` table, which only you can see (Supabase dashboard, **Table Editor**).
- `npm run backup` saves everybody to a dated file in `backups/`.

## Before you publish

The site is public, so think about what you write for relatives who are alive: a year instead of a full birth date (or no date at all) is usually enough.

`npm run build` creates the finished site in `dist/`. It is plain files and works on a static host that serves it from the root of a domain and sends unknown paths to `index.html` (Cloudflare Pages does both by default), because a side of the family has its own address, like `/machado`.

## Change the wording or language

All interface text is in `src/ui/strings.ts`.

## Checks

```
npm test
```
