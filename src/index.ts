import fs from 'fs';
// const { Scraper, Root, DownloadContent, OpenLinks, CollectContent } = require('nodejs-web-scraper');
import fetch from 'node-fetch';
import { parse } from 'node-html-parser';
import { decode } from 'html-entities';
import chalk from 'chalk';
import path from 'path';
import { exec } from 'child_process'
import cliSpinners from 'cli-spinners';

type Menu = {
    date: string;
    cilantroDay: boolean;
    veggieDay: boolean;
    menuItems: {
        title: string,
        descriptions: string[],
    }[]
};
const dateOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'long',
    day: '2-digit',
    weekday: 'long',
};

function toTitleCase(str: string) {
    return str.replace(
      /\w\S*/g,
      function(txt) {
        return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
      }
    );
  }
  

const formatMenu = (menu: Menu): string => {
    let formattedMenu = '';

    const currentDate = new Date();
    const formattedDate = toTitleCase(currentDate.toLocaleDateString('da-DK', dateOptions))
        .replace(/Den/, 'd.')
    formattedMenu += `${chalk.redBright(`${formattedDate}`)}`;

    menu.menuItems.forEach((menuItem) => {
        formattedMenu += ('\n\n' + chalk.yellow(menuItem.title) + '\n');
        menuItem.descriptions.forEach((description, idx) => {
            formattedMenu += `➤ ${description}`;
            if (idx < menuItem.descriptions.length - 1) {
                formattedMenu += '\n';
            }
        })
    })

    return formattedMenu;
}

(async () => {
    // Enable cli spinner
    const spinner = cliSpinners.bouncingBar;
    let frameIndex = 0;
    const loadingInterval = setInterval(() => {
        if (frameIndex >= spinner.frames.length) frameIndex = 0;
        process.stdout.clearLine(0);
        process.stdout.cursorTo(0);
        process.stdout.write(spinner.frames[frameIndex++]); // end the line
    }, spinner.interval)

    const currentDate = new Date();
    const formattedDate = currentDate.toLocaleDateString('da-DK', dateOptions);
    const match = formattedDate.match(/(\w+) den (\d+)\. (\w+)\.? (\d{4})/) as RegExpMatchArray;

    const [_, weekday, day, month, year] = match;
    const meyersStyleDate = `${day} ${month.slice(0,3)}, ${year}`;

    if (weekday == 'lørdag' || weekday == 'søndag') {
        clearInterval(loadingInterval)
        process.stdout.clearLine(0);
        process.stdout.cursorTo(0);
        console.log(chalk.redBright('No menu today - It\'s weekend idjet'));
        return;
    }
    const isVeggieDay = weekday == 'torsdag';


    let rsp: Awaited<ReturnType<typeof fetch>>;
    if (isVeggieDay) {
        rsp = await fetch('https://meyers.dk/erhverv/frokostordning/den-groenne/');
    } else {
        rsp = await fetch('https://meyers.dk/erhverv/frokostordning/det-velkendte/');
    }

    const text = await rsp.text();
    const root = parse(text);

    const availableDays = root.querySelectorAll('.week-menu__days li');
    const todaysMenuIdx = availableDays.map((html, idx) => {
        const date = html.querySelector('h5 > span');
        if (date?.text != meyersStyleDate) return null;

        return idx + 1
    }).filter(x => x)[0] ?? -1;

    const allRecipes = root.querySelectorAll('.week-menu-day__days > div');

    const todaysRecipeWrapper = allRecipes.find((html) => {
        return html.rawAttributes['aria-labelledby'] == `slide_${todaysMenuIdx.toString()}_label`;
    })

    const todaysRecipes = (todaysRecipeWrapper?.querySelectorAll('>div') ?? [])
        .find((element) => element.rawAttributes['data-tab-content'] == (isVeggieDay ? 'Den Gr&#248;nne' : 'Det velkendte'))
        ?.querySelector('div.space-y')
        ?.querySelectorAll('.menu-recipe-display');

    if (!todaysRecipes) {
        clearInterval(loadingInterval)
        process.stdout.clearLine(0);
        process.stdout.cursorTo(0);
        console.log(chalk.redBright('No menu today'));
        return;
    }

    const menuObj: Menu = { 
        date: currentDate.toISOString(),
        cilantroDay: false,
        veggieDay: isVeggieDay,
        menuItems: [],
    };

    todaysRecipes.forEach((recipe) => {
        const titleElement = recipe.querySelector('h4');
        const descriptionElement = recipe.querySelector('p');

        // Remove allergenes and non-menu items (nodeType 3 is TextElement)
        const cleanedDescriptionElements = descriptionElement?.childNodes.filter((child) => child.nodeType == 3);

        const title = decode(titleElement?.innerText.trim());
        const descriptions = cleanedDescriptionElements
            ?.map((desc) => {
                const decoded = decode(desc.innerText.trim());
                return decoded ? `${decoded}.` : '';
            })
            .filter((x) => x);

        menuObj.menuItems.push({
            title,
            descriptions: descriptions ?? [],
        })
    });
    
    // Highlight Koriander
    let formattedMenu = formatMenu(menuObj);
    formattedMenu = formattedMenu
        .replace(/koriander/gi, chalk.bgRedBright(chalk.black('koriander')));

    // In case of Koriander, Alert the world
    if (formattedMenu.match(/koriander/i)) {
        const alertAudio = path.join(__dirname, './assets/alert.mp3');
        exec(`afplay ${alertAudio}`)
        menuObj.cilantroDay = true;
    }

    // Save todays menu for properity
    const fileName = currentDate.toISOString().substring(0,10);
    const filePath = path.join(__dirname, './menus', `${fileName}.json`);
    fs.writeFileSync(filePath, JSON.stringify(menuObj))

    // Disable cli spinner
    clearInterval(loadingInterval)
    process.stdout.clearLine(0);
    process.stdout.cursorTo(0);

    console.log(formattedMenu);
})();
