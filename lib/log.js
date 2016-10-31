import moment from 'moment';
import chalk from 'chalk';

export default function(message) {
    console.log(`${chalk.green(moment().format('MMM D hh:mm:ss a'))}${chalk.gray(':')} ${message}`);
}