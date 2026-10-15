import './styles/tokens.css';
import {App} from './ui/app.js';
const app=new App(document.querySelector('#app'));
app.start().catch(error=>app.fail(error));
