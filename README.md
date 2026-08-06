> [!NOTE]  
> MetroLaunch code is reusable but only with proper attribution... Do not steal code...
>
> Credits
> - @sawyerthemiller (Leopard Industries) for MetroLaunch
> - @anupamme for security fix in ver 1.7.8


## MetroLaunch    /    [click here to install](https://sawyerthemiller.github.io/metrolaunch/)
A feature-rich third party home screen for iOS in the style of Microsoft's old MetroUI... Built as a PWA, so it's free forever, has smooth animations, is runnable offline, and gets hassle free updates via an in-built system. 

It even uses the original Windows 8 weather images :)

![screenshot-a](https://i.ibb.co/9HNxBPN0/IMG-3137.png)

**Getting into the launcher FASTER** - Opening the icon from the Apple Homescreen can get annoying quickly.
- Make a shortcut to open the URL prefaced with `webapp://` which is listed in this repo
- In order for this to work, you must have the app installed via the 'add to home screen option' already
- Then set it as the double back tap option

Also, not many iOS users know, but to swipe between apps, you can just swipe left or right on the navigation bar!!

Please fully read the readme before installing and using the launcher...

## This app relies on URL schemes to launch and add apps...

**What is a URL Scheme** 
- URL schema are links that are able to reference other apps installed on your device
- Both Android and iOS have them, but Android launchers don't usually ever need to rely on them

**So why do we have to** 
- Apple in their infinite wisdom has disallowed enumerating other apps on the device and opening them 'just because' and usually requires some sort of intent
- Hence, a weather app may have a scheme like `weather-app-best://getforloc=milwaukee` - note that is a pretty crude example but the point is the same
- Thanfully, opening an app with nothing in the url scheme usally works just fine. For example `netflix://` will just open the app `Netflix`

**How can I get them** 
- Sometimes you get lucky and it is just the app name with a `://` after it, or it is just the Bundle ID
- Other times, it's completely random gibberish. For example, the url scheme for the app `What The Forecast` is `fb1682603758661443://` so sometimes it is very hard to find them
- Usually there is lists online for them, but they usually don't have all the apps you'd want

## Ways to get them that are easier then guessing

**Download the theming app 'Brass'** 
- You can add apps to the home screen with it through a configuration profile and hold them on the home screen, press share, then copy link
- But sometimes you may notice it will still be blank!! Which means that the app has no URL scheme
- Don't panic, there is still a way that will work with all apps

**Shortcuts method** 
- Simply make a shortcut in the Apple Shortcuts app to open an app, and name it something simple like 'SC1' or 'SC2'
- Then, in the launcher, you can use the scheme `shortcuts://run-shortcut?name=[name]` and there will be no app this won't work with

## Spotify tile integration

- You need a Windows or Mac running Python 3 with the spotify app OPEN for this server part.
- Spotify is currently being a douche after a certain shadow library dumped all of their content and has halted new app creation. I am looking for a better way around this but don't hold your breath.

**Setting up Spotify 'now playing' tile**

- Due to modern web content security policies, the old way of completely self-hosting this no longer works.
- I've set up a PHP status server on my own web server which runs over HTTPS to get around this... It makes everything so much easier.
- Make sure Spotify is running on your computer, run `python` or `python3` `spotify_client.py` to register a username on the server, and put that username in the the settings of the Spotify tile. It is recommended you use a somewhat unique username.
- You will need to keep the Python client running to make sure the launcher syncs your Spotify status. 

The code of this server is no longer in the backends directory, but it is still what powers the app's tile... I will publish a video at some point explaining the launcher's new features and why i close sourced the data backend of it...

**Fair use warning** 

- I am not a big company, and I cannot afford abuse of bandwidth. This is a very low bandwidth implementation, but I will ask people not to 'test the limits' of my poor server
- Would be much appreicated, thanks :3

I am (probably) working on making a Linux server version...

## Using the launcher

- You will need an [OpenWeatherMap](https://openweathermap.org/) API key if you want the weather tile to work.
- The app will tell you how to do it.

To access the menu to add an app or go to the settings, press the vertical elipses menu in the status bar, and chose your option from there. To update the app, go the the settings cache section, then press update. Thanks for cheking this out everybody :)

## Contributing to the project

Anything is welcome, just please be nice to others and if you take code from somehwere ensure you have permission to do so, as I want to give credit where it's due...
