# Rat Race

## What It Does

Rat Race automatically searches for job listings every day across multiple platforms and compiles them into a clean, easy-to-read page that opens in your browser.

**Platforms searched:**
- LinkedIn
- Indeed
- ZipRecruiter
- Ashby
- Greenhouse
- Lever

Every day, two files are generated in your `rat-race/data/pages/` folder:
- `jobs_YYYY-MM-DD.html` - all job listings found that day
- `companies_YYYY-MM-DD.html` - new companies found that day

Double-click either file to open it in your browser.

---

## Getting Started

### Requirements
- Windows 10 or 11
- Google Chrome installed

### First-Time Setup

1. Open the `rat-race` folder
2. Double-click `setup.bat` and follow the prompts. This sets up the program to run automatically every day and creates shortcuts on your desktop
3. Double-click **Rat Race Login** on your desktop to open the setup app
4. Go to the **Settings** tab and enter your search URLs (see [Finding Your Search URLs](#finding-your-search-urls) below)
5. Go to the **Login** tab and log in to whichever platforms you have accounts on - all are optional
6. You're done. Rat Race will run automatically each time you log in to Windows

### Running Manually

If you want to run it outside of the automatic schedule, go to:
```
rat-race/jobfinder/jobfinder.exe
```
Double-click it and it will run immediately.

---

## Finding Your Search URLs

Each platform requires a search URL This is the URL of a job search results page with your criteria already applied.

### LinkedIn

1. Go to [linkedin.com/jobs](https://www.linkedin.com/jobs)
2. Search for your job title and location (e.g. "Software Engineer" in "Chicago, IL")
3. Apply filters: set **Date Posted** to **Past 24 hours** and **Sort By** to **Most Recent**
4. Copy the URL from your browser's address bar and paste it into the Settings tab

### Indeed

1. Go to [indeed.com](https://www.indeed.com)
2. Search for your job title and location
3. In the filters, set **Date Posted** to **Last 24 hours**
4. Sort by **Date** (most recent first)
5. Copy the URL and paste it into the Settings tab

### ZipRecruiter

1. Go to [ziprecruiter.com](https://www.ziprecruiter.com)
2. Search for your job title and location
3. Filter by **Posted Today** if available, otherwise last 24 hours
4. Copy the URL and paste it into the Settings tab

---

## Google Jobs URLs (Ashby, Greenhouse, Lever)

These three require a slightly different approach. You'll search Google directly using a special format, then grab the URL.

All three searches follow the same pattern. Open Google and search using this format, replacing the job titles and city with your own:

### Ashby

Search Google for:
```
site:jobs.ashbyhq.com ("Software Engineer" OR "Backend Engineer" OR "Full Stack Engineer" OR "Frontend Engineer") chicago
```

### Greenhouse

Search Google for:
```
site:boards.greenhouse.io ("Software Engineer" OR "Backend Engineer") remote
```

### Lever

Search Google for:
```
site:jobs.lever.co ("Software Engineer") ("Chicago" OR "Remote")
```

After each search:
1. Copy the URL from your browser's address bar
2. Add `&tbs=qdr:d` to the end of the URL. This filters results to the last 24 hours.

**Example Lever URL before:**
```
https://www.google.com/search?q=site:jobs.lever.co+("Software+Engineer"+OR+"Backend+Engineer")+chicago
```

**After adding the filter:**
```
https://www.google.com/search?q=site:jobs.lever.co+("Software+Engineer"+OR+"Backend+Engineer")+chicago&tbs=qdr:d
```

Paste all three URLs into the Settings tab under **Google Jobs**.

---

## Customizing Your Results

Inside `rat-race/data/` you'll find three files you can edit to fine-tune what Rat Race surfaces. Open them with Notepad or any text editor.

### `skills.json` - Your Skills

Lists the skills Rat Race looks for in job listings. Matching skills are highlighted in the results. Standout skills are highlighted in red.
To see an example or acquire a skills file for software roles, go to the repository's [data/skills_SOFTWARE_ENGINEER.json](https://github.com/linSchnepel/Rat-Race/blob/main/data/skills_SOFTWARE_ENGINEER.json) file.

```json
{
  "skills": [
    { "name": "TypeScript", "aliases": ["ts"], "standout": true },
    { "name": "Rust", "aliases": [], "standout": false },]
}
```

Add or remove skills to match your background. [See a full example here](#).

### `blacklist.json` - Companies and Titles to Ignore

Rat Race will skip any job that matches a blacklisted company name or job title.

```json
{
  "companies": ["Staffing Agency Name", "Recruiting Firm Inc"],
}
```

### `alerts.json` - Priority Alerts

Defines rules that flag certain jobs as high priority (marked with a ★ in results).

```json
{
  "rules": [
    { "name": "Any new job", "sound": "newJob", "titleContains": null,  "minStandoutSkills": 0 },
    { "name": "Junior", "sound": "noticeMe", "titleContains": "junior|jr|associate|entry",  "minStandoutSkills": 0 },
    { "name": "Possible", "sound": "noticeMe", "titleContains": null,  "minStandoutSkills": 2 }
  ]
}
```

---

## Your Daily Results

Results are saved to:
```
rat-race/data/pages/
```

There is also a **Job Results** shortcut on your desktop that takes you directly to this folder. Files are named by date:
```
jobs_2026-06-28.html
companies_2026-06-28.html
```

If the program runs more than once in a day (e.g. you ran it manually), results are saved as:
```
jobs_2026-06-28.html
jobs_2026-06-28-2.html
```

---

## Logging Back In

Job platform sessions expire periodically. If you notice results are missing or incomplete for a platform, it likely means your session has expired.

To re-authenticate:
1. Open **Rat Race Login** from your desktop
2. Go to the **Login** tab
3. Check the platforms you want to re-authenticate and click **Start Login**

---

## Uninstalling

Delete the `rat-race` folder.

To also remove the desktop shortcuts and startup entry:
- Delete **Rat Race Login** and **Job Results** from your Desktop
- Open the Start Menu, search for **Startup**, open the Startup folder, and delete the **Rat Race** shortcut inside it