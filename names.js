/* Pro BBALL Coach — name pools (fictional players), colleges, countries. */
(function () {
  'use strict';
  const PBC = (window.PBC = window.PBC || {});

  const maleFirst = `Aaron Adrian Ahmad Al Alec Alex Alonzo Amari Amir Andre Andrew Angelo Anthony Antoine Antonio Ari Armando Austin Avery
   Ben Blake Bobby Bradley Brandon Brendan Brian Bryce Bryson Caleb Calvin Cam Cameron Carl Carlos Carter Cedric Chance Chris Christian
  Cody Cole Collin Colby Corey Cortez Curtis Dante Damian Damon Dan Darius Darnell Darren Daryl David Davion Dawson  Demarcus
  Deandre Dennis Derek Desmond Devin Devonte Dillon Dominic Donovan Dorian Drew  Dylan Earl Eddie Elijah Elliot Emanuel Emeka Eric
  Ethan Evan Felix Fred Gabriel Garrett Gavin Gerald Grant Greg  Harold Harrison Hassan Hunter Ike Isaac Isaiah Ismael Ivan Jabari
  Jace Jackson Jacob Jaden Jake Jalen Jamal James Jamison Jared Jarrett Jason Javon Jay Jaylen Jaxon Jeff Jerome Jeremy Jericho Jesse Joel
  Johnny Jonah Jonathan Jordan Josh Josiah Julian Julius Justin Kam  Karl Keegan Keith Kellen Kelvin Kendall Kendrick Kenny Keon
  Kevin Khalil  Kyle  Lamar Lance Landon Larry Lawrence Leon Lester Levi Liam Lonnie Lorenzo Lucas  Malik Malcolm Marcus
  Mario Mark Markell Marvin Mason Matt Maurice Max Micah Michael  Miles Mitchell Mohamed Monte Myles Nate Nathan Nick Nico 
  Noah Norman  Omar Oscar Otto Parker Patrick Paul Pedro Preston Quentin Quincy Rafael Rashad Ray Reggie Ricky Robert Rodney Roman
  Ronnie Rudy Russell Ryan Sam  Sean  Seth Shane Shawn Simon Spencer Stephen Sterling Taj  Tariq Terrance Terry Theo
  Thomas Tim Tobias Tony  Travis Trent Trevor Tristan Troy Ty Tyler  Tyson Victor Vince Wade Walker Wendell Wes Will Xavier
  Yusuf Zach Zaire  Kofi Oumar Mamadou Luca Matteo Mateo Dario      Rui  Kai Bogdan Dejan Andrei`
    .split(/\s+/).filter(Boolean);

  const femaleFirst = `Aaliyah Abby Adrienne  Alana Alexis Aliyah Allie Alyssa Amani Amber Amelia Amira Ana Angel Angela Aniyah  Ariel
   Ashley Asia Aubrey Aurora Ayanna Bailey Bella Bianca Breanna Brianna Brittney Brooke Caitlin Cameron Candace Carla Cassidy Celeste
  Chelsea Chloe Ciara Courtney Crystal Dana Daniela Danielle Deja  Destiny Diamond Diana Dominique Ebony Elena Elizabeth Ella Emily
  Emma Erica Esther Eva Evelyn  Faith Gabby Gabriela Grace Hailey Haley Hannah Imani Isabel Isla Ivy Jackie Jada Jade Jaelyn Jasmine
  Jayla Jewell Jocelyn Jordan Josie Julia  Kaila  Kara Kari Kate Kayla Kelsey Kendra Kennedy Kia Kiara Kierra  Kira
  Kristen Kylee Lauren Layla Leah Leilani Lexie Liz Lindsay Lola Lucy Luisa Lydia Maddie Maya Megan Mercedes Mia Micaela Mikayla Monique
  Morgan  Nadia Naomi Natalie Nia Nicole Nina  Olivia Paige Paris Payton Rachel Raven Rebecca  Riley Rosa Ruby Sabrina
  Sam Sara Sasha  Savannah Selena Shakira Shanice Sierra Skylar Sophia Stephanie Sydney Tamara Tanisha Tasha Taylor Tiana Tiffany
  Tina Toni Trinity Valerie Vanessa Victoria Whitney Yvonne Zoe Zaria  Marina       `
    .split(/\s+/).filter(Boolean);

  const last = `Abbott Adams   Alexander Allen Alvarez Anderson Andrews Anthony Armstrong Arnold Atkins Bailey Baker Baldwin
  Ball Banks Barnes Barrett Bates Battle Beasley Bell Bennett Benson Berry Bishop Black Blackwell Blair  Bolden Booker Bowen
  Boyd Bradley Branch Brewer Bridges Brooks Brown Bryant Buckner Burke Burns Butler Byrd Caldwell Campbell Carroll Carter Castillo
  Chambers Chandler Chapman Christie Clark Clarke Clayton Cleveland Coleman Collins Conley Cook Cooper Cox Crawford Crosby Cunningham
  Curry Dalton Daniels Davenport Davis Dawson Dean Delgado Dixon Dorsey Douglas  Duncan Dunn  Dyson Edwards Ellington
  Ellis  Evans  Ferguson Fields Fisher Fleming Fletcher Flowers Ford Foster Fox Francis Franklin Frazier Freeman Fuller Gaines
  Garland Garner Garrett Gibson Gilbert Giles Gordon Graham Grant Graves Gray Green Greene Griffin Hall Hamilton Hampton  
  Hardy Harper Harris Hart Hawkins Hayes Haywood Henderson Henry  Hill Hines Holiday Holland Holmes Hood Horton Howard Hudson Hughes
  Hunter Ingram  Isaac Jackson James Jefferson Jenkins Johnson Jones Jordan Joseph Kane Keller Kennedy  King Knight Knox Lamb
  Lane Lawson Lee Leonard Lewis Little Lopez Love  Lynch Mack Maddox Malone Mann Marshall Martin Mathis  Mays McBride
   McDaniel McGee McKinney Merrill Middleton Miles Miller Mills Mitchell Monk Montgomery Moody Moore Morgan Morris Morrison
  Moses Murray Myers Nance Neal Nelson Newton Nichols Noel Norman Norris Oliver Olson Owens Page Palmer Parker Patterson Patton Payne
  Payton Pearson Perkins Perry Peters Phillips Pierce  Porter Powell Price Pritchard Quinn  Randolph Ray Reed Reese Reid
  Rhodes Rice Richards Richardson Riley Rivers Roberts Robinson Rodgers Rogers Rose Ross Russell Sampson Sanders Saunders Scott 
  Shannon Sharpe Shaw Simmons Simpson Sims Smart Smith Spencer Stanley Stephens Stevens Stewart Stokes Strickland Strong Sullivan Tate
  Taylor Terry Thomas Thompson Tillman Tucker Turner Tyler Vance Vaughn Wade Walker Wallace Walton Ward Warren Washington Waters Watson
  Weaver Webb Wells West Wheeler White Whitfield Wiggins Wilkins Williams Wilson Winslow Wood Woods Wright Young
  Okafor Okeke   Nwosu Eze Diallo Traore Ndiaye Mbaye Sissoko Diop Kone Toure Mensah Boateng Asante Kamara
  Novak Petrovic  Markovic Nikolic Vasquez Rodriguez Hernandez Garcia Martinez Ramirez Santos Silva Costa Pereira Fernandez
  Moreau Dubois Laurent Fournier Rossi Bianchi Esposito Muller Schneider Weber Fischer Wagner Becker Jensen Larsen Nilsson Lindqvist
  Kowalski Nowak Horvat Kovac Sato Tanaka Watanabe Kim Park Lee-Chen Wong Liu Zhang Singh Patel Khan Haddad Nassar Aziz Cohen Levy
  O'Brien  McCarthy Murphy Kelly Walsh Byrne Doyle Gallagher Kavanagh`
    .split(/\s+/).filter(Boolean);

  const colleges = `Duke;Kentucky;Kansas;North Carolina;UCLA;Gonzaga;Michigan State;Arizona;Villanova;Connecticut;Houston;Baylor;Texas;
  Indiana;Ohio State;Michigan;Florida;Auburn;Alabama;Arkansas;Tennessee;Louisville;Syracuse;Georgetown;Memphis;Virginia;Purdue;
  Iowa;Wisconsin;Illinois;Oregon;USC;Stanford;Washington;Creighton;Marquette;Xavier;Maryland;LSU;Texas Tech;Oklahoma;Iowa State;
  Colorado;Utah;San Diego State;Saint Mary's;Wake Forest;Miami;Florida State;Georgia Tech;Notre Dame;Providence;St. John's;
  Seton Hall;Butler;Dayton;VCU;Davidson;Murray State;Belmont;South Carolina;Mississippi State;Ole Miss;Missouri;Nebraska;Rutgers;
  Penn State;Northwestern;Cincinnati;West Virginia;TCU;Kansas State;Oklahoma State;BYU;Nevada;UNLV;Fresno State;New Mexico;
  Boise State;Wichita State;Temple;SMU;Tulane;Pittsburgh;Clemson;NC State;Virginia Tech;Boston College`.split(';').map(s => s.trim()).filter(Boolean);

  const countries = `France;Serbia;Spain;Australia;Canada;Germany;Lithuania;Greece;Slovenia;Croatia;Nigeria;Senegal;Cameroon;Turkey;
  Italy;Latvia;Finland;Japan;Brazil;Argentina;Dominican Republic;Bahamas;Montenegro;Bosnia;Israel;Mali;South Sudan;Congo;Ukraine;
  Czech Republic;Poland;New Zealand;Philippines;China;South Korea;Puerto Rico;Georgia;Sweden;Denmark;Netherlands;Belgium;Great Britain`
    .split(';').map(s => s.trim()).filter(Boolean);

  const intlClubs = `Paris;Real Madrid;Barcelona;Partizan;Crvena Zvezda;Olympiacos;Panathinaikos;Fenerbahce;Anadolu Efes;Zalgiris;
  Maccabi Tel Aviv;Bayern Munich;ALBA Berlin;Monaco;ASVEL;Valencia;Baskonia;Virtus Bologna;Olimpia Milano;Mega Basket;Cedevita;
  NBL Next Stars;Perth;Sydney;Melbourne United;Tasmania;Ignite;Unicaja;Joventut;Gran Canaria`.split(';').map(s => s.trim()).filter(Boolean);

  const coachFirst = `Mike Steve Gregg Erik Doc Rick Tom Nick Tyronn Monty Jason Chris Joe Quin Taylor Mark Ime Jamahl Darvin Willie Frank
  Wes Chauncey Billy Kenny Jacque Dwane Brian Jeff Lloyd Stan Dave Terry Mitch JB Adrian Charles Will Kristi Jenny Becky Lindsay Cheryl
  Stephanie Natalie Tanisha Latricia Karl Sandy Noelle Vickie`.split(/\s+/).filter(Boolean);

  PBC.Names = { maleFirst, femaleFirst, last, colleges, countries, intlClubs, coachFirst };
})();
