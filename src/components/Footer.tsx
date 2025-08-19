const Footer = () => {

  return (
    <footer className="py-2 border-t border-white/10">

      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row justify-between items-center">
          <p className="text-sm text-muted-foreground mb-4 md:mb-0">
            © 2024 Vloggo. All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              Made with ❤️ by creators, for creators
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;